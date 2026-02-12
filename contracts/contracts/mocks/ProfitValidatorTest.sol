// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../ProfitValidator.sol";

/// @title ProfitValidatorTest — Exposes ProfitValidator library functions for testing
contract ProfitValidatorTest {
    function testCalculateFees(uint256 grossProfit) external pure returns (uint256, uint256) {
        return ProfitValidator.calculateFees(grossProfit);
    }

    function testIsProfitable(uint256 amountOut, uint256 amountIn) external pure returns (bool, uint256) {
        return ProfitValidator.isProfitable(amountOut, amountIn);
    }


}
