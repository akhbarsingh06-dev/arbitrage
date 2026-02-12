// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IDEXAdapter.sol";

/// @title ISwapRouter — Minimal UniswapV3/PancakeV3 SwapRouter interface
interface IPancakeV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @title IQuoterV2 — Minimal UniswapV3/PancakeV3 Quoter interface
interface IPancakeV3QuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );
}

/// @title PancakeV3Adapter — DEX adapter for PancakeSwap V3 on Base
/// @notice Wraps PancakeSwap V3 SwapRouter for unified swap interface
contract PancakeV3Adapter is IDEXAdapter {
    using SafeERC20 for IERC20;

    IPancakeV3SwapRouter public immutable swapRouter;
    IPancakeV3QuoterV2 public immutable quoter;

    constructor(address _swapRouter, address _quoter) {
        require(_swapRouter != address(0), "PancakeV3: zero router");
        require(_quoter != address(0), "PancakeV3: zero quoter");
        swapRouter = IPancakeV3SwapRouter(_swapRouter);
        quoter = IPancakeV3QuoterV2(_quoter);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) external override returns (uint256 amountOut) {
        uint24 fee = abi.decode(data, (uint24));

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(swapRouter), amountIn);

        IPancakeV3SwapRouter.ExactInputSingleParams memory params = IPancakeV3SwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: msg.sender,
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });

        amountOut = swapRouter.exactInputSingle(params);
    }

    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external view override returns (uint256 amountOut) {
        uint24 fee = abi.decode(data, (uint24));
        bytes memory callData = abi.encodeCall(
            IPancakeV3QuoterV2.quoteExactInputSingle,
            (IPancakeV3QuoterV2.QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: fee,
                sqrtPriceLimitX96: 0
            }))
        );

        (bool ok, bytes memory ret) = address(quoter).staticcall(callData);
        require(ok, "PancakeV3: quote failed");

        (amountOut,,,) = abi.decode(ret, (uint256, uint160, uint32, uint256));
    }

    function dexName() external pure override returns (string memory) {
        return "PancakeSwap V3";
    }
}

