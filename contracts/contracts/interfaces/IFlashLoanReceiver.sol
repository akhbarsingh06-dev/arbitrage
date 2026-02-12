// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IFlashLoanReceiver — Aave V3 flashLoanSimple callback interface
/// @notice Implemented by contracts that want to receive flash loans via Aave V3 `flashLoanSimple`
interface IFlashLoanReceiver {
    /// @notice Called by Aave Pool after flash loan funds are transferred
    /// @param asset Borrowed asset address
    /// @param amount Borrowed amount
    /// @param premium Flash loan fee
    /// @param initiator Address that initiated the flash loan
    /// @param params Encoded parameters passed to the flash loan
    /// @return True if the operation was successful
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

/// @title IPool — Minimal Aave V3 Pool interface for flash loans
interface IPool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;

    function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128);
}
