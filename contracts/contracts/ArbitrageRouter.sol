// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IDEXAdapter.sol";
import "./interfaces/ITreasury.sol";
import "./ProfitValidator.sol";

/// @title ArbitrageRouter — Multi-hop swap orchestrator with profit validation
/// @notice Routes arbitrage trades through multiple DEX adapters and enforces profitability
/// @dev Called by FlashLoanExecutor or directly for non-flash-loan arbitrage
contract ArbitrageRouter is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ProfitValidator for uint256;

    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    /// @notice Protocol treasury address
    ITreasury public treasury;

    /// @notice Registered DEX adapters
    mapping(address => bool) public registeredAdapters;

    /// @notice Maximum allowed slippage in basis points (default 100 = 1%)
    uint256 public maxSlippageBps = 100;

    /// @notice Minimum profit threshold in wei
    uint256 public minProfitThreshold = 0;

    /// @notice Circuit breaker: maximum gas price (in wei) to execute
    uint256 public maxGasPrice = 50 gwei;

    /// @notice Represents a single swap step in an arbitrage route
    struct SwapStep {
        address adapter;      // DEX adapter address
        address tokenIn;      // Input token
        address tokenOut;     // Output token
        uint256 amountIn;     // Amount to swap (0 = use full balance from previous step)
        uint256 minAmountOut; // Minimum output (slippage protection)
        bytes data;           // Adapter-specific encoded data (pool fees, etc.)
    }

    /// @notice Emitted when an arbitrage route is successfully executed
    event ArbitrageExecuted(
        address indexed user,
        address indexed profitToken,
        uint256 grossProfit,
        uint256 protocolFee,
        uint256 userProfit,
        uint256 timestamp
    );

    /// @notice Emitted when an adapter is registered or unregistered
    event AdapterUpdated(address indexed adapter, bool registered);

    constructor(address admin, address _treasury) {
        require(admin != address(0), "Router: zero admin");
        require(_treasury != address(0), "Router: zero treasury");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        treasury = ITreasury(_treasury);
    }

    /// @notice Execute a multi-step arbitrage route
    /// @param steps Array of swap steps to execute sequentially
    /// @param profitToken Token in which profit is measured
    /// @param initialAmount Starting amount of profitToken
    /// @param minNetProfit Minimum acceptable user profit
    /// @param user Address to receive the user's share of profit
    /// @param deadline Timestamp after which the transaction reverts
    function executeRoute(
        SwapStep[] calldata steps,
        address profitToken,
        uint256 initialAmount,
        uint256 minNetProfit,
        address user,
        uint256 deadline
    ) external onlyRole(EXECUTOR_ROLE) whenNotPaused nonReentrant {
        require(block.timestamp <= deadline, "Router: expired deadline");
        require(tx.gasprice <= maxGasPrice, "Router: gas price too high");
        require(steps.length >= 2, "Router: need at least 2 steps");
        require(user != address(0), "Router: zero user");

        // Record starting balance
        uint256 startBalance = IERC20(profitToken).balanceOf(address(this));
        require(startBalance >= initialAmount, "Router: insufficient start balance");

        // Execute each swap step
        for (uint256 i = 0; i < steps.length; i++) {
            _executeStep(steps[i]);
        }

        // Calculate profit
        uint256 endBalance = IERC20(profitToken).balanceOf(address(this));
        require(endBalance > startBalance, "Router: no profit");

        uint256 grossProfit = endBalance - startBalance;

        // Validate profit and calculate fees
        (uint256 protocolFee, uint256 userProfit) = ProfitValidator.calculateFees(grossProfit);
        require(userProfit >= minNetProfit, "Router: below min profit");
        require(userProfit > 0, "Router: zero user profit");

        // Transfer protocol fee to treasury
        IERC20(profitToken).forceApprove(address(treasury), protocolFee);
        treasury.receiveFee(profitToken, protocolFee);

        // Transfer user profit
        IERC20(profitToken).safeTransfer(user, userProfit);

        emit ArbitrageExecuted(user, profitToken, grossProfit, protocolFee, userProfit, block.timestamp);
    }

    /// @notice Execute a single swap step
    function _executeStep(SwapStep calldata step) internal {
        require(registeredAdapters[step.adapter], "Router: unregistered adapter");

        uint256 amountIn = step.amountIn;
        if (amountIn == 0) {
            // Use full balance of tokenIn (for chained swaps)
            amountIn = IERC20(step.tokenIn).balanceOf(address(this));
        }

        require(amountIn > 0, "Router: zero input amount");

        // Approve adapter to spend tokens
        IERC20(step.tokenIn).safeIncreaseAllowance(step.adapter, amountIn);

        // Execute swap via adapter
        uint256 amountOut = IDEXAdapter(step.adapter).swap(
            step.tokenIn,
            step.tokenOut,
            amountIn,
            step.minAmountOut,
            step.data
        );

        require(amountOut >= step.minAmountOut, "Router: slippage exceeded");
    }

    // ═══════════════════════════════════════════════
    //  ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════

    /// @notice Register or unregister a DEX adapter
    function setAdapter(address adapter, bool registered) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(adapter != address(0), "Router: zero adapter");
        registeredAdapters[adapter] = registered;
        emit AdapterUpdated(adapter, registered);
    }

    /// @notice Update treasury address
    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Router: zero treasury");
        treasury = ITreasury(_treasury);
    }

    /// @notice Update maximum slippage
    function setMaxSlippage(uint256 _maxSlippageBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_maxSlippageBps <= 1000, "Router: slippage too high"); // max 10%
        maxSlippageBps = _maxSlippageBps;
    }

    /// @notice Update minimum profit threshold
    function setMinProfitThreshold(uint256 _minProfit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minProfitThreshold = _minProfit;
    }

    /// @notice Update maximum gas price for circuit breaker
    function setMaxGasPrice(uint256 _maxGasPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxGasPrice = _maxGasPrice;
    }

    /// @notice Pause the router
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the router
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Emergency token rescue (in case tokens get stuck)
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Emergency ETH rescue
    function emergencyWithdrawETH(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        (bool sent, ) = to.call{value: address(this).balance}("");
        require(sent, "Router: ETH transfer failed");
    }

    receive() external payable {}
}
