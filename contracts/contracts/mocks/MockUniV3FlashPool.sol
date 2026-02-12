// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IUniswapV3FlashPool.sol";

interface IUniV3FlashCallback {
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external;
}

/// @title MockUniV3FlashPool — Minimal Uniswap V3 flash pool for tests
/// @dev Transfers tokens to recipient, calls callback, and expects repayment + fee.
contract MockUniV3FlashPool is IUniswapV3FlashPool {
    using SafeERC20 for IERC20;

    address public immutable override token0;
    address public immutable override token1;

    uint16 public immutable feeBps; // test fee in bps

    constructor(address _token0, address _token1, uint16 _feeBps) {
        require(_token0 != address(0) && _token1 != address(0), "MockUniV3FlashPool: zero token");
        token0 = _token0;
        token1 = _token1;
        feeBps = _feeBps;
    }

    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external override {
        uint256 bal0Before = IERC20(token0).balanceOf(address(this));
        uint256 bal1Before = IERC20(token1).balanceOf(address(this));

        if (amount0 > 0) IERC20(token0).safeTransfer(recipient, amount0);
        if (amount1 > 0) IERC20(token1).safeTransfer(recipient, amount1);

        uint256 fee0 = (amount0 * uint256(feeBps)) / 10_000;
        uint256 fee1 = (amount1 * uint256(feeBps)) / 10_000;

        IUniV3FlashCallback(recipient).uniswapV3FlashCallback(fee0, fee1, data);

        uint256 bal0After = IERC20(token0).balanceOf(address(this));
        uint256 bal1After = IERC20(token1).balanceOf(address(this));

        require(bal0After >= bal0Before + fee0, "MockUniV3FlashPool: token0 not repaid");
        require(bal1After >= bal1Before + fee1, "MockUniV3FlashPool: token1 not repaid");
    }
}

