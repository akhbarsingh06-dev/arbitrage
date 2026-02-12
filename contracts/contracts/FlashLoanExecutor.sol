// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "./interfaces/IDEXAdapter.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IUniswapV3FlashPool.sol";
import "./ArbitrageRouter.sol";
import "./ProfitValidator.sol";
import "./RiskManager.sol";

/// @title FlashLoanExecutor — Entry point for flash-loan-funded arbitrage
/// @notice Borrows from Aave V3, delegates to ArbitrageRouter, validates profit, splits fees
/// @dev This is the main contract users interact with (via relayer)
contract FlashLoanExecutor is IFlashLoanReceiver, AccessControl, EIP712, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /// @notice Aave V3 Pool on Base
    IPool public aavePool;

    /// @notice Arbitrage router for executing swap routes
    ArbitrageRouter public arbitrageRouter;

    /// @notice Protocol treasury
    ITreasury public treasury;

    /// @notice Centralized risk management module (circuit breakers + allowlists)
    RiskManager public riskManager;

    /// @notice Execution stats
    uint256 public totalExecutions;
    uint256 public totalProfitGenerated; // Net profit after gas refund, before fee split
    uint256 public totalProtocolFees;
    uint256 public totalUserProfit;
    uint256 public totalGasRefunded;

    /// @notice Per-asset execution stats (for multi-asset accounting)
    mapping(address => uint256) public totalArbitrageVolumeByAsset; // total borrowed amount
    mapping(address => uint256) public totalProfitGeneratedByAsset; // netProfit after gas refund, before fee split
    mapping(address => uint256) public totalProtocolFeesByAsset;
    mapping(address => uint256) public totalUserProfitByAsset;
    mapping(address => uint256) public totalGasRefundedByAsset;

    address[] public trackedAssets;
    mapping(address => bool) public isTrackedAsset;

    /// @notice User intent nonce (for signed-intent execution)
    mapping(address => uint256) public nonces;

    struct ExecutionIntent {
        address user;
        address asset;
        uint256 amount;
        bytes32 routeHash;
        uint256 minNetProfit; // Minimum acceptable user profit (after gas refund + 15% fee)
        uint256 deadline;
        address refundRecipient;
        uint256 maxGasRefund;
        uint256 nonce;
    }

    bytes32 public constant EXECUTION_INTENT_TYPEHASH =
        keccak256(
            "ExecutionIntent(address user,address asset,uint256 amount,bytes32 routeHash,uint256 minNetProfit,uint256 deadline,address refundRecipient,uint256 maxGasRefund,uint256 nonce)"
        );

    /// @notice Struct for encoding flash loan parameters
    struct ArbitrageParams {
        ArbitrageRouter.SwapStep[] steps;
        address profitToken;
        uint256 minNetProfit;
        address user;
        uint256 deadline;
        address refundRecipient;
        uint256 maxGasRefund;
    }

    struct UniV3FlashParams {
        ArbitrageRouter.SwapStep[] steps;
        address profitToken;
        uint256 minNetProfit;
        address user;
        uint256 deadline;
        address refundRecipient;
        uint256 maxGasRefund;
        address flashPool;
        uint256 amount; // borrowed amount of profitToken
        bool isToken0;
    }

    /// @notice Emitted on successful flash loan arbitrage
    event FlashArbExecuted(
        address indexed user,
        address indexed asset,
        uint256 flashAmount,
        uint256 grossProfit,
        uint256 gasRefund,
        uint256 protocolFee,
        uint256 userProfit,
        uint256 timestamp
    );

    /// @notice Emitted on circuit breaker trigger
    event CircuitBreakerTriggered(string reason, uint256 value, uint256 threshold);
    event FallbackFlashUsed(address indexed pool, address indexed asset, uint256 amount);

    constructor(
        address admin,
        address _aavePool,
        address _arbitrageRouter,
        address _treasury,
        address _riskManager
    ) EIP712("BaseArbExecutor", "1") {
        require(admin != address(0), "Executor: zero admin");
        require(_arbitrageRouter != address(0), "Executor: zero router");
        require(_treasury != address(0), "Executor: zero treasury");
        require(_riskManager != address(0), "Executor: zero risk");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        // `_aavePool` may be zero on networks without Aave; use UniV3 flash fallback.
        aavePool = IPool(_aavePool);
        arbitrageRouter = ArbitrageRouter(payable(_arbitrageRouter));
        treasury = ITreasury(_treasury);
        riskManager = RiskManager(_riskManager);
    }

    function getTrackedAssets() external view returns (address[] memory) {
        return trackedAssets;
    }

    /// @notice Initiate a flash-loan-funded arbitrage
    /// @param asset Token to borrow via flash loan
    /// @param amount Amount to borrow
    /// @param steps Swap steps for the arbitrage route
    /// @param minNetProfit Minimum acceptable net profit for user
    /// @param user Address to receive user's profit share
    /// @param deadline Timestamp after which transaction reverts
    function executeArbitrage(
        address asset,
        uint256 amount,
        ArbitrageRouter.SwapStep[] calldata steps,
        uint256 minNetProfit,
        address user,
        uint256 deadline
    ) external onlyRole(RELAYER_ROLE) whenNotPaused {
        riskManager.validatePreExecution(
            asset,
            amount,
            steps,
            minNetProfit,
            user,
            deadline,
            address(0),
            0
        );

        _initiateAaveFlashLoan(asset, amount, steps, minNetProfit, user, deadline, address(0), 0);
    }

    /// @notice Execute using a user-signed intent (hybrid model: user signs, keeper/relayer submits)
    function executeArbitrageWithIntent(
        ExecutionIntent calldata intent,
        ArbitrageRouter.SwapStep[] calldata steps,
        bytes calldata signature
    ) external onlyRole(RELAYER_ROLE) whenNotPaused {
        _verifyAndConsumeIntent(intent, steps, signature);
        _initiateAaveFlashLoan(
            intent.asset,
            intent.amount,
            steps,
            intent.minNetProfit,
            intent.user,
            intent.deadline,
            intent.refundRecipient,
            intent.maxGasRefund
        );
    }

    /// @notice Fallback flash path: Uniswap V3 pool flash (only when Aave is not configured)
    /// @dev Requires `riskManager.uniV3FlashPoolAllowed(flashPool) == true`.
    function executeArbitrageWithIntentUniV3Flash(
        ExecutionIntent calldata intent,
        ArbitrageRouter.SwapStep[] calldata steps,
        bytes calldata signature,
        address flashPool
    ) external onlyRole(RELAYER_ROLE) whenNotPaused {
        require(address(aavePool) == address(0), "Executor: Aave configured");
        require(flashPool != address(0), "Executor: zero flash pool");
        require(riskManager.uniV3FlashPoolAllowed(flashPool), "Executor: flash pool not allowed");
        _verifyAndConsumeIntent(intent, steps, signature);
        _initiateUniV3Flash(
            flashPool,
            intent.asset,
            intent.amount,
            steps,
            intent.minNetProfit,
            intent.user,
            intent.deadline,
            intent.refundRecipient,
            intent.maxGasRefund
        );
    }

    /// @notice Aave V3 flash loan callback
    /// @dev Called by Aave Pool after funds are transferred
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override whenNotPaused nonReentrant returns (bool) {
        require(msg.sender == address(aavePool), "Executor: caller not pool");
        require(initiator == address(this), "Executor: invalid initiator");
        uint256 amountOwed = amount + premium;

        // Decode arbitrage parameters
        (
            ArbitrageRouter.SwapStep[] memory steps,
            address profitToken,
            uint256 minNetProfit,
            address user,
            uint256 deadline,
            address refundRecipient,
            uint256 maxGasRefund
        ) = abi.decode(params, (ArbitrageRouter.SwapStep[], address, uint256, address, uint256, address, uint256));

        require(profitToken == asset, "Executor: profit token mismatch");
        require(block.timestamp <= deadline, "Executor: expired deadline");

        // Execute swaps directly from this contract so we retain funds to repay Aave
        _executeRouteSteps(steps, asset, amount);

        // Calculate profit after repaying flash loan
        uint256 currentBalance = IERC20(asset).balanceOf(address(this));
        require(currentBalance >= amountOwed, "Executor: insufficient for repayment");

        uint256 grossProfit = currentBalance - amountOwed;
        // Profit threshold enforced post-execution by RiskManager

        uint256 gasRefund = 0;
        if (maxGasRefund > 0) {
            if (grossProfit >= maxGasRefund) gasRefund = maxGasRefund;
            else gasRefund = grossProfit;

            IERC20(asset).safeTransfer(refundRecipient, gasRefund);
            totalGasRefunded += gasRefund;
            totalGasRefundedByAsset[asset] += gasRefund;
        }

        uint256 netProfit = grossProfit - gasRefund;
        require(netProfit > 0, "Executor: zero net profit");

        // Validate and calculate fees
        (uint256 protocolFee, uint256 userProfit) = ProfitValidator.calculateFees(netProfit);
        require(userProfit >= minNetProfit, "Executor: below min profit");
        require(userProfit > 0, "Executor: zero user profit");
        riskManager.validatePostExecution(asset, grossProfit, gasRefund, minNetProfit, userProfit);

        // Repay flash loan
        IERC20(asset).forceApprove(address(aavePool), amountOwed);

        // Transfer protocol fee to treasury
        IERC20(asset).forceApprove(address(treasury), protocolFee);
        treasury.receiveFee(asset, protocolFee);

        // Transfer user profit
        IERC20(asset).safeTransfer(user, userProfit);

        // Update stats
        totalExecutions++;
        totalProfitGenerated += netProfit;
        totalProtocolFees += protocolFee;
        totalUserProfit += userProfit;
        totalArbitrageVolumeByAsset[asset] += amount;
        totalProfitGeneratedByAsset[asset] += netProfit;
        totalProtocolFeesByAsset[asset] += protocolFee;
        totalUserProfitByAsset[asset] += userProfit;
        _trackAsset(asset);

        emit FlashArbExecuted(
            user,
            asset,
            amount,
            grossProfit,
            gasRefund,
            protocolFee,
            userProfit,
            block.timestamp
        );

        return true;
    }

    /// @notice Execute swap steps directly (without router's profit validation)
    function _executeRouteSteps(
        ArbitrageRouter.SwapStep[] memory steps,
        address startToken,
        uint256 startAmount
    ) internal {
        require(steps[0].tokenIn == startToken, "Executor: route start mismatch");
        require(steps[steps.length - 1].tokenOut == startToken, "Executor: route end mismatch");

        for (uint256 i = 0; i < steps.length; i++) {
            address adapter = steps[i].adapter;
            require(arbitrageRouter.registeredAdapters(adapter), "Executor: unregistered adapter");

            uint256 amountIn = steps[i].amountIn;
            if (amountIn == 0) {
                amountIn = i == 0
                    ? startAmount
                    : IERC20(steps[i].tokenIn).balanceOf(address(this));
            }

            IERC20(steps[i].tokenIn).forceApprove(adapter, amountIn);

            IDEXAdapter(adapter).swap(
                steps[i].tokenIn,
                steps[i].tokenOut,
                amountIn,
                steps[i].minAmountOut,
                steps[i].data
            );
        }

        // Pull all output tokens back to this contract if they're elsewhere
        // (adapters should return tokens to msg.sender)
    }

    // ═══════════════════════════════════════════════
    //  ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════

    function setArbitrageRouter(address _router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_router != address(0), "Executor: zero router");
        arbitrageRouter = ArbitrageRouter(payable(_router));
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Executor: zero treasury");
        treasury = ITreasury(_treasury);
    }

    function setAavePool(address _pool) external onlyRole(DEFAULT_ADMIN_ROLE) {
        aavePool = IPool(_pool);
    }

    function setRiskManager(address _riskManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_riskManager != address(0), "Executor: zero risk");
        riskManager = RiskManager(_riskManager);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Emergency token rescue
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransfer(to, amount);
    }

    function _initiateAaveFlashLoan(
        address asset,
        uint256 amount,
        ArbitrageRouter.SwapStep[] calldata steps,
        uint256 minNetProfit,
        address user,
        uint256 deadline,
        address refundRecipient,
        uint256 maxGasRefund
    ) internal {
        require(address(aavePool) != address(0), "Executor: Aave not configured");
        // Encode arbitrage parameters for callback
        bytes memory callbackParams = abi.encode(
            steps,
            asset, // profitToken
            minNetProfit,
            user,
            deadline,
            refundRecipient,
            maxGasRefund
        );

        aavePool.flashLoanSimple(
            address(this),
            asset,
            amount,
            callbackParams,
            0 // referral code
        );
    }

    function _verifyAndConsumeIntent(
        ExecutionIntent calldata intent,
        ArbitrageRouter.SwapStep[] calldata steps,
        bytes calldata signature
    ) internal {
        require(intent.user != address(0), "Executor: zero user");
        riskManager.validatePreExecution(
            intent.asset,
            intent.amount,
            steps,
            intent.minNetProfit,
            intent.user,
            intent.deadline,
            intent.refundRecipient,
            intent.maxGasRefund
        );

        bytes32 routeHash = keccak256(abi.encode(steps));
        require(routeHash == intent.routeHash, "Executor: route hash mismatch");

        uint256 currentNonce = nonces[intent.user];
        require(intent.nonce == currentNonce, "Executor: bad nonce");
        nonces[intent.user] = currentNonce + 1;

        bytes32 structHash = keccak256(
            abi.encode(
                EXECUTION_INTENT_TYPEHASH,
                intent.user,
                intent.asset,
                intent.amount,
                intent.routeHash,
                intent.minNetProfit,
                intent.deadline,
                intent.refundRecipient,
                intent.maxGasRefund,
                intent.nonce
            )
        );
        address signer = _hashTypedDataV4(structHash).recover(signature);
        require(signer == intent.user, "Executor: invalid signature");
    }

    function _initiateUniV3Flash(
        address flashPool,
        address asset,
        uint256 amount,
        ArbitrageRouter.SwapStep[] calldata steps,
        uint256 minNetProfit,
        address user,
        uint256 deadline,
        address refundRecipient,
        uint256 maxGasRefund
    ) internal {
        IUniswapV3FlashPool pool = IUniswapV3FlashPool(flashPool);
        address token0 = pool.token0();
        address token1 = pool.token1();

        bool isToken0 = asset == token0;
        require(isToken0 || asset == token1, "Executor: asset not in pool");

        uint256 amount0 = isToken0 ? amount : 0;
        uint256 amount1 = isToken0 ? 0 : amount;

        UniV3FlashParams memory p = UniV3FlashParams({
            steps: steps,
            profitToken: asset,
            minNetProfit: minNetProfit,
            user: user,
            deadline: deadline,
            refundRecipient: refundRecipient,
            maxGasRefund: maxGasRefund,
            flashPool: flashPool,
            amount: amount,
            isToken0: isToken0
        });

        emit FallbackFlashUsed(flashPool, asset, amount);
        pool.flash(address(this), amount0, amount1, abi.encode(p));
    }

    /// @notice Uniswap V3 flash callback (fallback flash path)
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data)
        external
        whenNotPaused
        nonReentrant
    {
        UniV3FlashParams memory p = abi.decode(data, (UniV3FlashParams));
        // Vulnerability Fix: Verify that the caller (pool) is an allowed pool.
        require(riskManager.uniV3FlashPoolAllowed(msg.sender), "Executor: unauthorized flash pool");
        require(msg.sender == p.flashPool, "Executor: caller not flash pool");
        require(block.timestamp <= p.deadline, "Executor: expired deadline");

        uint256 fee = p.isToken0 ? fee0 : fee1;
        uint256 amountOwed = p.amount + fee;

        _executeRouteSteps(p.steps, p.profitToken, p.amount);

        uint256 balanceBeforeRepay = IERC20(p.profitToken).balanceOf(address(this));
        require(balanceBeforeRepay >= amountOwed, "Executor: insufficient for repayment");

        // Repay flash + fee to pool first; remaining balance is profit
        IERC20(p.profitToken).safeTransfer(msg.sender, amountOwed);

        uint256 grossProfit = balanceBeforeRepay - amountOwed;

        uint256 gasRefund = 0;
        if (p.maxGasRefund > 0) {
            gasRefund = grossProfit >= p.maxGasRefund ? p.maxGasRefund : grossProfit;
            IERC20(p.profitToken).safeTransfer(p.refundRecipient, gasRefund);
            totalGasRefunded += gasRefund;
            totalGasRefundedByAsset[p.profitToken] += gasRefund;
        }

        uint256 netProfit = grossProfit - gasRefund;
        require(netProfit > 0, "Executor: zero net profit");

        (uint256 protocolFee, uint256 userProfit) = ProfitValidator.calculateFees(netProfit);
        require(userProfit >= p.minNetProfit, "Executor: below min profit");
        require(userProfit > 0, "Executor: zero user profit");
        riskManager.validatePostExecution(p.profitToken, grossProfit, gasRefund, p.minNetProfit, userProfit);

        IERC20(p.profitToken).forceApprove(address(treasury), protocolFee);
        treasury.receiveFee(p.profitToken, protocolFee);

        IERC20(p.profitToken).safeTransfer(p.user, userProfit);

        totalExecutions++;
        totalProfitGenerated += netProfit;
        totalProtocolFees += protocolFee;
        totalUserProfit += userProfit;
        totalArbitrageVolumeByAsset[p.profitToken] += p.amount;
        totalProfitGeneratedByAsset[p.profitToken] += netProfit;
        totalProtocolFeesByAsset[p.profitToken] += protocolFee;
        totalUserProfitByAsset[p.profitToken] += userProfit;
        _trackAsset(p.profitToken);

        emit FlashArbExecuted(
            p.user,
            p.profitToken,
            p.amount,
            grossProfit,
            gasRefund,
            protocolFee,
            userProfit,
            block.timestamp
        );
    }

    function _trackAsset(address asset) internal {
        if (!isTrackedAsset[asset]) {
            isTrackedAsset[asset] = true;
            trackedAssets.push(asset);
        }
    }

    receive() external payable {}
}
