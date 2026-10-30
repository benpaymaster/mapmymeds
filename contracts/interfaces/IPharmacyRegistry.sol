// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

/// @title IPharmacyRegistry
/// @notice Read interface that every MapMyMeds contract depends on to decide who counts as a verified pharmacy.
/// @dev Keeping consumers on this interface lets the verification logic be replaced without redeploying them.
interface IPharmacyRegistry {
    /// @notice Returns true if `pharmacy` is registered, not revoked and its verification has not expired.
    function isVerifiedPharmacy(address pharmacy) external view returns (bool);
}
