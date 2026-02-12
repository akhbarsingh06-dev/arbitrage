// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IUniswapV3FlashPool — Minimal Uniswap V3 pool flash interface
interface IUniswapV3FlashPool {
    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
    function token0() external view returns (address);
    function token1() external view returns (address);
}

