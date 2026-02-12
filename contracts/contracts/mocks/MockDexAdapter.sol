// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDEXAdapter.sol";

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
}

/// @title MockDexAdapter — Simple minting swap adapter for tests
/// @dev Pulls tokenIn from caller and mints tokenOut to caller with a configurable bonus (bps).
contract MockDexAdapter is IDEXAdapter {
    using SafeERC20 for IERC20;

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) external returns (uint256 amountOut) {
        uint16 bonusBps = data.length == 0 ? 0 : abi.decode(data, (uint16));

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        amountOut = amountIn + (amountIn * uint256(bonusBps)) / 10000;
        IMintableERC20(tokenOut).mint(msg.sender, amountOut);

        require(amountOut >= minAmountOut, "MockDexAdapter: slippage");
    }

    function getAmountOut(
        address,
        address,
        uint256 amountIn,
        bytes calldata data
    ) external pure returns (uint256 amountOut) {
        uint16 bonusBps = data.length == 0 ? 0 : abi.decode(data, (uint16));
        return amountIn + (amountIn * uint256(bonusBps)) / 10000;
    }

    function dexName() external pure returns (string memory) {
        return "MockDex";
    }
}

