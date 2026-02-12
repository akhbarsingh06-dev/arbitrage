// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ITreasury.sol";

/// @title Treasury — Protocol fee collector and manager
/// @notice Collects 15% performance fees from arbitrage profits
/// @dev Only authorized executors can deposit fees; only admin can withdraw
contract Treasury is ITreasury, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    /// @notice Total fees collected per token
    mapping(address => uint256) private _totalCollected;

    /// @notice Total fees withdrawn per token
    mapping(address => uint256) public totalWithdrawn;

    constructor(address admin) {
        require(admin != address(0), "Treasury: zero admin");
        _grantRole(ADMIN_ROLE, admin);
    }

    /// @inheritdoc ITreasury
    function receiveFee(address token, uint256 amount) external override onlyRole(EXECUTOR_ROLE) whenNotPaused {
        require(amount > 0, "Treasury: zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _totalCollected[token] += amount;
        emit FeeReceived(token, amount, block.timestamp);
    }

    /// @inheritdoc ITreasury
    function withdraw(address token, address to, uint256 amount) external override onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Treasury: zero recipient");
        require(amount > 0, "Treasury: zero amount");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(amount <= balance, "Treasury: insufficient balance");
        totalWithdrawn[token] += amount;
        IERC20(token).safeTransfer(to, amount);
        emit FeeWithdrawn(token, to, amount);
    }

    /// @inheritdoc ITreasury
    function totalCollected(address token) external view override returns (uint256) {
        return _totalCollected[token];
    }

    /// @notice Current balance of a token held in the treasury
    function balance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /// @notice Emergency withdraw all of a token (admin only)
    function emergencyWithdraw(address token, address to) external onlyRole(ADMIN_ROLE) {
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Treasury: nothing to withdraw");
        IERC20(token).safeTransfer(to, bal);
        emit FeeWithdrawn(token, to, bal);
    }

    /// @notice Pause the treasury
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the treasury
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Receive ETH (for gas refunds or direct ETH fees)
    receive() external payable {}

    /// @notice Withdraw ETH from treasury
    function withdrawETH(address payable to, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Treasury: zero recipient");
        require(amount <= address(this).balance, "Treasury: insufficient ETH");
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "Treasury: ETH transfer failed");
    }
}
