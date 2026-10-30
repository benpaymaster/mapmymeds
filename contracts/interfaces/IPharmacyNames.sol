// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

/// @title IPharmacyNames
/// @notice Issues ENS subnames (e.g. everest.mapmymeds.eth) to newly verified pharmacies.
interface IPharmacyNames {
    function issue(string calldata label, address pharmacy) external returns (bytes32 node);
}
