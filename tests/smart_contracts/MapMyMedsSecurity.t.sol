// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import "forge-std/Test.sol";
import "../../contracts/PharmacyInventory.sol";
import "../../contracts/PrescriptionNFT.sol";

// Mock Registry implementing the shared interface
contract MockRegistry is IPharmacyRegistry {
    mapping(address => bool) public verified;

    function setVerified(address pharmacy, bool status) external {
        verified[pharmacy] = status;
    }

    function isVerifiedPharmacy(address pharmacy) external view override returns (bool) {
        return verified[pharmacy];
    }
}

contract MapMyMedsSecurityTest is Test {
    PharmacyInventory inventory;
    PrescriptionNFT prescriptionNFT;
    MockRegistry registry;

    address owner = address(this);
    address verifiedPharmacy1 = address(0x1111);
    address verifiedPharmacy2 = address(0x2222);
    address unverifiedEntity = address(0x3333);

    event ProofUpdated(address indexed pharmacy, string medication, bytes32 proof);

    function setUp() public {
        registry = new MockRegistry();
        inventory = new PharmacyInventory(address(registry));
        prescriptionNFT = new PrescriptionNFT(address(registry));

        registry.setVerified(verifiedPharmacy1, true);
        registry.setVerified(verifiedPharmacy2, true);
    }

    function test_Inventory_SuccessUpdate() public {
        vm.prank(verifiedPharmacy1);
        bytes32 validProof = keccak256("valid_zk_proof_1");
        
        vm.expectEmit(true, true, true, true);
        emit ProofUpdated(verifiedPharmacy1, "AMOX_500", validProof);

        inventory.updateStockProof("AMOX_500", validProof);
        assertEq(inventory.getProof(verifiedPharmacy1, "AMOX_500"), validProof);
    }

    function test_Inventory_RevertUnverifiedCaller() public {
        vm.prank(unverifiedEntity);
        bytes32 proof = keccak256("rogue_proof");

        vm.expectRevert("Caller is not a verified pharmacy");
        inventory.updateStockProof("AMOX_500", proof);
    }

    function test_NFT_SuccessMint() public {
        bytes32 rxHash = keccak256("prescription_data_xyz");
        
        prescriptionNFT.mint(verifiedPharmacy1, rxHash);

        assertEq(prescriptionNFT.balanceOf(verifiedPharmacy1), 1);
        assertEq(prescriptionNFT.fulfillingPharmacy(0), verifiedPharmacy1);
        assertTrue(prescriptionNFT.verifyPrescription(0, rxHash));
    }

    function test_NFT_RevertDoubleMintReplay() public {
        bytes32 rxHash = keccak256("prescription_data_xyz");

        prescriptionNFT.mint(verifiedPharmacy1, rxHash);

        vm.expectRevert("Prescription NFT already minted");
        prescriptionNFT.mint(verifiedPharmacy2, rxHash);
    }
}