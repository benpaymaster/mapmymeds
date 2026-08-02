// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

interface IPharmacyRegistry {
    function isVerifiedPharmacy(address pharmacy) external view returns (bool);
}