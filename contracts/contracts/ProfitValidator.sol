// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ProfitValidator — Library for profit validation and fee calculation
/// @notice Pure math functions for arbitrage profit validation
/// @dev Used by ArbitrageRouter and FlashLoanExecutor to ensure profitability
library ProfitValidator {
    /// @notice Protocol fee percentage (15%)
    uint256 public constant PROTOCOL_FEE_BPS = 1500; // 15% in basis points
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Error thrown when trade is not profitable
    error UnprofitableTrade(uint256 grossProfit, uint256 totalCosts);

    /// @notice Error thrown when user profit is zero after fees
    error ZeroUserProfit();



    /// @notice Calculate protocol fee and user profit from gross profit
    /// @param grossProfit Total profit before protocol fee
    /// @return protocolFee 15% fee for protocol treasury
    /// @return userProfit 85% remaining for user
    function calculateFees(uint256 grossProfit) internal pure returns (
        uint256 protocolFee,
        uint256 userProfit
    ) {
        protocolFee = (grossProfit * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        userProfit = grossProfit - protocolFee;
    }

    /// @notice Simple profitability check without fee calculation
    /// @param amountOut Amount received
    /// @param amountIn Amount spent (including all costs)
    /// @return isProfitable Whether the trade is profitable
    /// @return profit The profit amount (0 if unprofitable)
    function isProfitable(
        uint256 amountOut,
        uint256 amountIn
    ) internal pure returns (bool, uint256 profit) {
        if (amountOut > amountIn) {
            return (true, amountOut - amountIn);
        }
        return (false, 0);
    }
}
