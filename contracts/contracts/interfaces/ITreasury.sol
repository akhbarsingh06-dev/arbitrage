// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ITreasury — Interface for protocol treasury
/// @notice Manages collection and withdrawal of protocol fees
interface ITreasury {
    /// @notice Receive protocol fee in a specific token
    /// @param token The ERC20 token address
    /// @param amount The fee amount
    function receiveFee(address token, uint256 amount) external;

    /// @notice Withdraw accumulated fees (owner only)
    /// @param token The ERC20 token address
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function withdraw(address token, address to, uint256 amount) external;

    /// @notice Total fees collected for a specific token
    /// @param token The ERC20 token address
    /// @return Total amount collected
    function totalCollected(address token) external view returns (uint256);

    /// @notice Emitted when a fee is received
    event FeeReceived(address indexed token, uint256 amount, uint256 timestamp);

    /// @notice Emitted when fees are withdrawn
    event FeeWithdrawn(address indexed token, address indexed to, uint256 amount);
}
