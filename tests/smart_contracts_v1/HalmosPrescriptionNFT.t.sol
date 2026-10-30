// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import "forge-std/Test.sol";
import "../../contracts/PrescriptionNFT.sol";

// Rename or wrap the mock to avoid global collisions
contract MockRegistryForHalmos {
    mapping(address => bool) public verified;

    function setVerified(address pharmacy, bool status) external {
        verified[pharmacy] = status;
    }

    function isVerifiedPharmacy(address pharmacy) external view returns (bool) {
        return verified[pharmacy];
    }
}

contract HalmosPrescriptionNFTTest is Test {
    PrescriptionNFT prescriptionNFT;
    MockRegistryForHalmos registry;

    function setUp() public {
        registry = new MockRegistryForHalmos();
        prescriptionNFT = new PrescriptionNFT(address(registry));
    }

    function check_symbolic_mint_uniqueness(address to, bytes32 rxHash) public {
        vm.assume(to != address(0));
        vm.assume(rxHash != bytes32(0));

        bool isVerified = registry.isVerifiedPharmacy(to);

        if (!isVerified) {
            vm.expectRevert("Recipient is not a verified pharmacy");
            prescriptionNFT.mint(to, rxHash);
            return;
        }

        prescriptionNFT.mint(to, rxHash);
        assert(prescriptionNFT.hashUsed(rxHash) == true);

        vm.expectRevert("Prescription NFT already minted");
        prescriptionNFT.mint(to, rxHash);
    }
}