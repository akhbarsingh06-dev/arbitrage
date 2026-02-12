// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IDEXAdapter.sol";

/// @title IAerodromeRouter — Minimal Aerodrome Router interface
interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(
        uint256 amountIn,
        Route[] calldata routes
    ) external view returns (uint256[] memory amounts);

    function defaultFactory() external view returns (address);
}

/// @title AerodromeAdapter — DEX adapter for Aerodrome on Base
/// @notice Wraps Aerodrome Router for unified swap interface
contract AerodromeAdapter is IDEXAdapter {
    using SafeERC20 for IERC20;

    /// @notice Aerodrome Router on Base
    IAerodromeRouter public immutable aeroRouter;

    /// @notice Default pool factory
    address public immutable defaultFactory;

    constructor(address _aeroRouter) {
        require(_aeroRouter != address(0), "Aero: zero router");
        aeroRouter = IAerodromeRouter(_aeroRouter);
        defaultFactory = aeroRouter.defaultFactory();
    }

    /// @inheritdoc IDEXAdapter
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) external override returns (uint256 amountOut) {
        // Decode whether to use stable pool
        bool stable = abi.decode(data, (bool));

        // Transfer tokens from caller
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve router
        IERC20(tokenIn).forceApprove(address(aeroRouter), amountIn);

        // Build route
        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: tokenIn,
            to: tokenOut,
            stable: stable,
            factory: defaultFactory
        });

        // Execute swap
        uint256[] memory amounts = aeroRouter.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            routes,
            msg.sender, // Return tokens to caller (router)
            block.timestamp
        );

        amountOut = amounts[amounts.length - 1];
    }

    /// @inheritdoc IDEXAdapter
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external view override returns (uint256 amountOut) {
        bool stable = abi.decode(data, (bool));

        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: tokenIn,
            to: tokenOut,
            stable: stable,
            factory: defaultFactory
        });

        uint256[] memory amounts = aeroRouter.getAmountsOut(amountIn, routes);
        amountOut = amounts[amounts.length - 1];
    }

    /// @inheritdoc IDEXAdapter
    function dexName() external pure override returns (string memory) {
        return "Aerodrome";
    }
}
