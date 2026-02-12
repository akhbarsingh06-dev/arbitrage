// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IDEXAdapter.sol";

/// @title ISwapRouter — Minimal Uniswap V3 SwapRouter interface
interface ISwapRouter {
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

/// @title IQuoterV2 — Minimal Uniswap V3 Quoter interface
interface IQuoterV2 {
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

/// @title UniswapV3Adapter — DEX adapter for Uniswap V3 on Base
/// @notice Wraps Uniswap V3 SwapRouter for unified swap interface
contract UniswapV3Adapter is IDEXAdapter {
    using SafeERC20 for IERC20;

    /// @notice Uniswap V3 SwapRouter on Base
    ISwapRouter public immutable swapRouter;

    /// @notice Uniswap V3 QuoterV2 on Base
    IQuoterV2 public immutable quoter;

    constructor(address _swapRouter, address _quoter) {
        require(_swapRouter != address(0), "UniV3: zero router");
        require(_quoter != address(0), "UniV3: zero quoter");
        swapRouter = ISwapRouter(_swapRouter);
        quoter = IQuoterV2(_quoter);
    }

    /// @inheritdoc IDEXAdapter
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) external override returns (uint256 amountOut) {
        // Decode pool fee from data (e.g., 500, 3000, 10000)
        uint24 fee = abi.decode(data, (uint24));

        // Transfer tokens from caller
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve router
        IERC20(tokenIn).forceApprove(address(swapRouter), amountIn);

        // Execute swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: msg.sender, // Return tokens to caller (router)
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0 // No price limit
        });

        amountOut = swapRouter.exactInputSingle(params);
    }

    /// @inheritdoc IDEXAdapter
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external view override returns (uint256 amountOut) {
        uint24 fee = abi.decode(data, (uint24));
        bytes memory callData = abi.encodeCall(
            IQuoterV2.quoteExactInputSingle,
            (IQuoterV2.QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: fee,
                sqrtPriceLimitX96: 0
            }))
        );

        (bool ok, bytes memory ret) = address(quoter).staticcall(callData);
        require(ok, "UniV3: quote failed");

        (amountOut,,,) = abi.decode(ret, (uint256, uint160, uint32, uint256));
    }

    /// @inheritdoc IDEXAdapter
    function dexName() external pure override returns (string memory) {
        return "Uniswap V3";
    }
}
