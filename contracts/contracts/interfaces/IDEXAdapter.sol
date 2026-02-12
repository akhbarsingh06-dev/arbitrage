// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IDEXAdapter — Common interface for all DEX adapters
/// @notice Provides a unified swap interface for different DEX protocols
interface IDEXAdapter {
    /// @notice Execute a token swap
    /// @param tokenIn Address of the input token
    /// @param tokenOut Address of the output token
    /// @param amountIn Amount of input tokens
    /// @param minAmountOut Minimum acceptable output amount (slippage protection)
    /// @param data Additional adapter-specific encoded data
    /// @return amountOut Actual amount of tokens received
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) external returns (uint256 amountOut);

    /// @notice Get expected output amount for a swap (view-only quote)
    /// @param tokenIn Address of the input token
    /// @param tokenOut Address of the output token
    /// @param amountIn Amount of input tokens
    /// @param data Additional adapter-specific encoded data
    /// @return amountOut Expected amount of tokens to receive
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external view returns (uint256 amountOut);

    /// @notice Returns the name of the DEX this adapter connects to
    function dexName() external pure returns (string memory);
}
