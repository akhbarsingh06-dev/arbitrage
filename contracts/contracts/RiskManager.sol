// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./ArbitrageRouter.sol";

/// @title RiskManager — Centralized circuit breakers and allowlists
/// @notice Provides reusable validation for atomic arbitrage executions.
contract RiskManager is AccessControl, Pausable {
    bytes32 public constant RISK_ADMIN_ROLE = keccak256("RISK_ADMIN_ROLE");

    struct AssetConfig {
        bool enabled;
        uint256 maxFlashLoanAmount;
        uint256 minProfitThreshold;
        uint256 maxGasRefund; // Denominated in the borrowed asset (profit token)
    }

    /// @notice Global max gas price (wei)
    uint256 public maxGasPrice;

    /// @notice Enforce per-step minAmountOut > 0
    bool public enforceMinAmountOut;

    /// @notice Per-asset risk configuration
    mapping(address => AssetConfig) public assetConfigs;

    /// @notice Optional adapter allowlist (in addition to router registry checks)
    mapping(address => bool) public adapterAllowed;
    /// @notice Whether to enforce adapter allowlist checks
    bool public enforceAdapterAllowlist;

    /// @notice Optional UniswapV3 flash pool allowlist (for fallback flash path)
    mapping(address => bool) public uniV3FlashPoolAllowed;

    event AssetConfigUpdated(address indexed asset, AssetConfig cfg);
    event AdapterAllowed(address indexed adapter, bool allowed);
    event AdapterAllowlistEnforced(bool enforced);
    event UniV3FlashPoolAllowed(address indexed pool, bool allowed);
    event GlobalLimitsUpdated(uint256 maxGasPrice, bool enforceMinAmountOut);

    constructor(address admin, uint256 _maxGasPrice, bool _enforceMinAmountOut) {
        require(admin != address(0), "Risk: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RISK_ADMIN_ROLE, admin);

        maxGasPrice = _maxGasPrice;
        enforceMinAmountOut = _enforceMinAmountOut;
        enforceAdapterAllowlist = false;
    }

    // ═══════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════

    function setGlobalLimits(uint256 _maxGasPrice, bool _enforceMinAmountOut)
        external
        onlyRole(RISK_ADMIN_ROLE)
    {
        maxGasPrice = _maxGasPrice;
        enforceMinAmountOut = _enforceMinAmountOut;
        emit GlobalLimitsUpdated(_maxGasPrice, _enforceMinAmountOut);
    }

    function setAssetConfig(
        address asset,
        bool enabled,
        uint256 maxFlashLoanAmount,
        uint256 minProfitThreshold,
        uint256 maxGasRefund
    ) external onlyRole(RISK_ADMIN_ROLE) {
        require(asset != address(0), "Risk: zero asset");
        assetConfigs[asset] = AssetConfig({
            enabled: enabled,
            maxFlashLoanAmount: maxFlashLoanAmount,
            minProfitThreshold: minProfitThreshold,
            maxGasRefund: maxGasRefund
        });
        emit AssetConfigUpdated(asset, assetConfigs[asset]);
    }

    function setAdapterAllowed(address adapter, bool allowed) external onlyRole(RISK_ADMIN_ROLE) {
        require(adapter != address(0), "Risk: zero adapter");
        adapterAllowed[adapter] = allowed;
        emit AdapterAllowed(adapter, allowed);
    }

    function setAdapterAllowlistEnforced(bool enforced) external onlyRole(RISK_ADMIN_ROLE) {
        enforceAdapterAllowlist = enforced;
        emit AdapterAllowlistEnforced(enforced);
    }

    function setUniV3FlashPoolAllowed(address pool, bool allowed) external onlyRole(RISK_ADMIN_ROLE) {
        require(pool != address(0), "Risk: zero pool");
        uniV3FlashPoolAllowed[pool] = allowed;
        emit UniV3FlashPoolAllowed(pool, allowed);
    }

    function pause() external onlyRole(RISK_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(RISK_ADMIN_ROLE) {
        _unpause();
    }

    // ═══════════════════════════════════════════════
    //  VALIDATION
    // ═══════════════════════════════════════════════

    function validatePreExecution(
        address asset,
        uint256 amount,
        ArbitrageRouter.SwapStep[] calldata steps,
        uint256 minNetProfit,
        address user,
        uint256 deadline,
        address refundRecipient,
        uint256 maxGasRefund
    ) external view whenNotPaused {
        AssetConfig memory cfg = assetConfigs[asset];
        require(cfg.enabled, "Risk: asset disabled");
        require(tx.gasprice <= maxGasPrice, "Risk: gas price too high");
        require(block.timestamp <= deadline, "Risk: expired deadline");
        require(user != address(0), "Risk: zero user");
        require(steps.length >= 2, "Risk: need >=2 steps");
        require(amount > 0 && amount <= cfg.maxFlashLoanAmount, "Risk: bad amount");

        // Route must cycle back to the borrowed asset
        require(steps[0].tokenIn == asset, "Risk: route start mismatch");
        require(steps[steps.length - 1].tokenOut == asset, "Risk: route end mismatch");

        if (enforceMinAmountOut) {
            for (uint256 i = 0; i < steps.length; i++) {
                require(steps[i].minAmountOut > 0, "Risk: minAmountOut required");
            }
        }

        if (enforceAdapterAllowlist) {
            for (uint256 i = 0; i < steps.length; i++) {
                require(adapterAllowed[steps[i].adapter], "Risk: adapter not allowed");
            }
        }

        if (maxGasRefund > 0) {
            require(refundRecipient != address(0), "Risk: zero refund recipient");
            require(maxGasRefund <= cfg.maxGasRefund, "Risk: refund too high");
        }

        // minNetProfit is enforced post-execution; keep it bounded to avoid nonsense
        require(minNetProfit <= type(uint128).max, "Risk: minNetProfit too large");
    }

    function validatePostExecution(
        address asset,
        uint256 grossProfit,
        uint256 gasRefund,
        uint256 minNetProfit,
        uint256 userProfit
    ) external view whenNotPaused {
        AssetConfig memory cfg = assetConfigs[asset];
        require(cfg.enabled, "Risk: asset disabled");
        require(grossProfit >= cfg.minProfitThreshold, "Risk: below min threshold");
        require(gasRefund <= cfg.maxGasRefund, "Risk: refund too high");
        require(userProfit >= minNetProfit, "Risk: below min profit");
        require(userProfit > 0, "Risk: zero user profit");
    }
}
