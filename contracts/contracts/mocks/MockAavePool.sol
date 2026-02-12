// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IFlashLoanReceiver.sol";

/// @title MockAavePool — Simulates Aave V3 Pool for testing
contract MockAavePool {
    uint128 public constant FLASHLOAN_PREMIUM_TOTAL = 5; // 0.05% in BPS

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 /* referralCode */
    ) external {
        uint256 premium = (amount * uint256(FLASHLOAN_PREMIUM_TOTAL)) / 10000;

        // Transfer loan to receiver
        require(IERC20(asset).transfer(receiverAddress, amount), "MockAavePool: transfer failed");

        // Callback
        bool ok = IFlashLoanReceiver(receiverAddress).executeOperation(
            asset,
            amount,
            premium,
            receiverAddress,
            params
        );
        require(ok, "MockAavePool: callback failed");

        // Pull repayment
        require(
            IERC20(asset).transferFrom(receiverAddress, address(this), amount + premium),
            "MockAavePool: repay failed"
        );
    }
}
