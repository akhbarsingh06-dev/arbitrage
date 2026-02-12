// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IDEXAdapter.sol";

interface IExecutorReenter {
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external;
}

/// @title ReentrantDexAdapter — Malicious adapter that attempts to re-enter executor during a flash callback
/// @dev Used to assert `ReentrancyGuard` protections on FlashLoanExecutor.
contract ReentrantDexAdapter is IDEXAdapter {
    address public immutable executor;

    constructor(address _executor) {
        executor = _executor;
    }

    function swap(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external returns (uint256) {
        // Attempt reentrancy into the executor callback.
        IExecutorReenter(executor).uniswapV3FlashCallback(0, 0, "0x");
        // Unreachable; kept to satisfy interface.
        return 0;
    }

    function getAmountOut(address, address, uint256 amountIn, bytes calldata) external pure returns (uint256) {
        return amountIn;
    }

    function dexName() external pure returns (string memory) {
        return "ReentrantMock";
    }
}

