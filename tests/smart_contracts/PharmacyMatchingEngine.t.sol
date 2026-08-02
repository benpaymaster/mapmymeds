// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import "forge-std/Test.sol";
import "../../contracts/PharmacyMatchingEngine.sol";
import "../../contracts/IPharmacyRegistry.sol";

// Mock Registry for testing access control
contract MockPharmacyRegistry is IPharmacyRegistry {
    mapping(address => bool) public verifiedPharmacies;

    function setVerified(address pharmacy, bool status) external {
        verifiedPharmacies[pharmacy] = status;
    }

    function isVerifiedPharmacy(address pharmacy) external view override returns (bool) {
        return verifiedPharmacies[pharmacy];
    }
}

contract PharmacyMatchingEngineTest is Test {
    PharmacyMatchingEngine public matchingEngine;
    MockPharmacyRegistry public registry;

    address public pharmacyA = address(0x1);
    address public pharmacyB = address(0x2);
    address public unverifiedUser = address(0x3);

    event ListingCreated(uint256 indexed listingId, address indexed pharmacy, bytes32 indexed medicationHash);
    event MatchFulfilled(uint256 indexed listingId, address indexed fulfiller, bytes32 complianceProof);

    function setUp() public {
        registry = new MockPharmacyRegistry();
        matchingEngine = new PharmacyMatchingEngine(address(registry));

        // Set up verified pharmacies
        registry.setVerified(pharmacyA, true);
        registry.setVerified(pharmacyB, true);
    }

    function test_CreateListing_Success() public {
        bytes32 medHash = keccak256(abi.encodePacked("Paracetamol_500mg"));
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(pharmacyA);
        vm.expectEmit(true, true, true, true);
        emit ListingCreated(0, pharmacyA, medHash);

        matchingEngine.createListing(medHash, expiry);

        (address owner, bytes32 storedHash, uint256 storedExpiry, bool active) = matchingEngine.listings(0);
        assertEq(owner, pharmacyA);
        assertEq(storedHash, medHash);
        assertEq(storedExpiry, expiry);
        assertTrue(active);
    }

    function test_CreateListing_RevertUnverified() public {
        bytes32 medHash = keccak256(abi.encodePacked("Ibuprofen"));
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(unverifiedUser);
        vm.expectRevert("Caller is not a verified pharmacy");
        matchingEngine.createListing(medHash, expiry);
    }

    function test_FulfillMatch_Success() public {
        bytes32 medHash = keccak256(abi.encodePacked("Aspirin"));
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(pharmacyA);
        matchingEngine.createListing(medHash, expiry);

        bytes32 proof = keccak256(abi.encodePacked("ZKP_COMPLIANCE_PROOF_123"));

        vm.prank(pharmacyB);
        vm.expectEmit(true, true, true, true);
        emit MatchFulfilled(0, pharmacyB, proof);

        matchingEngine.fulfillMatch(0, proof);

        (,,, bool active) = matchingEngine.listings(0);
        assertFalse(active);
        assertTrue(matchingEngine.complianceProofUsed(proof));
    }

    function test_FulfillMatch_RevertDoubleUseProof() public {
        bytes32 medHash = keccak256(abi.encodePacked("Insulin"));
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(pharmacyA);
        matchingEngine.createListing(medHash, expiry);

        bytes32 proof = keccak256(abi.encodePacked("SHARED_PROOF"));

        vm.prank(pharmacyB);
        matchingEngine.fulfillMatch(0, proof);

        // Try to create another listing and use the exact same proof (Replay attack simulation)
        bytes32 medHash2 = keccak256(abi.encodePacked("Metformin"));
        vm.prank(pharmacyA);
        matchingEngine.createListing(medHash2, expiry);

        vm.prank(pharmacyB);
        vm.expectRevert("Compliance proof already utilized");
        matchingEngine.fulfillMatch(1, proof);
    }
}