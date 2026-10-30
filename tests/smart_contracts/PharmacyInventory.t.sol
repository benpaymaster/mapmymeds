// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Base} from "./utils/Base.t.sol";
import {PharmacyInventory} from "../../contracts/PharmacyInventory.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract PharmacyInventoryTest is Base {
    // NHS dm+d style codes (illustrative). Short string literals fit in bytes32.
    // forge-lint: disable-start(unsafe-typecast)
    bytes32 internal constant ATORVASTATIN = bytes32("dmd:320000000");
    bytes32 internal constant AMLODIPINE = bytes32("dmd:319283001");
    bytes32 internal constant OMEPRAZOLE = bytes32("dmd:317249006");
    bytes32 internal constant METFORMIN = bytes32("dmd:325278007");
    // forge-lint: disable-end(unsafe-typecast)

    bytes32[4] internal leaves;
    bytes32 internal root;

    function setUp() public override {
        super.setUp();
        leaves[0] = inventory.leafFor(ATORVASTATIN, 3, keccak256("s0"));
        leaves[1] = inventory.leafFor(AMLODIPINE, 1, keccak256("s1"));
        leaves[2] = inventory.leafFor(OMEPRAZOLE, 0, keccak256("s2"));
        leaves[3] = inventory.leafFor(METFORMIN, 2, keccak256("s3"));
        root = _hashPair(_hashPair(leaves[0], leaves[1]), _hashPair(leaves[2], leaves[3]));
    }

    /// Sorted-pair hashing, matching OpenZeppelin MerkleProof and the OpenZeppelin merkle-tree JS library.
    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function _proofForLeaf0() internal view returns (bytes32[] memory proof) {
        proof = new bytes32[](2);
        proof[0] = leaves[1];
        proof[1] = _hashPair(leaves[2], leaves[3]);
    }

    function test_updateSnapshot_andVerifyItem() public {
        vm.prank(everest);
        inventory.updateSnapshot(root);
        (bytes32 storedRoot, uint64 updatedAt) = inventory.snapshots(everest);
        assertEq(storedRoot, root);
        assertEq(updatedAt, block.timestamp);
        assertTrue(inventory.verifyItem(everest, ATORVASTATIN, 3, keccak256("s0"), _proofForLeaf0()));
    }

    function test_verifyItem_rejectsWrongBand() public {
        vm.prank(everest);
        inventory.updateSnapshot(root);
        // Claiming "high" stock (3) is checked; claiming "medium" (2) for the same drug fails.
        assertFalse(inventory.verifyItem(everest, ATORVASTATIN, 2, keccak256("s0"), _proofForLeaf0()));
    }

    function test_verifyItem_rejectsWithoutSalt() public {
        vm.prank(everest);
        inventory.updateSnapshot(root);
        assertFalse(inventory.verifyItem(everest, ATORVASTATIN, 3, bytes32(0), _proofForLeaf0()));
    }

    function test_verifyItem_rejectsStaleSnapshot() public {
        vm.prank(everest);
        inventory.updateSnapshot(root);
        vm.warp(block.timestamp + inventory.MAX_STALENESS() + 1);
        assertFalse(inventory.verifyItem(everest, ATORVASTATIN, 3, keccak256("s0"), _proofForLeaf0()));
    }

    function test_verifyItem_rejectsRevokedPharmacy() public {
        vm.prank(everest);
        inventory.updateSnapshot(root);
        vm.prank(admin);
        registry.revoke(everest);
        assertFalse(inventory.verifyItem(everest, ATORVASTATIN, 3, keccak256("s0"), _proofForLeaf0()));
    }

    function test_verifyItem_rejectsOtherPharmacysRoot() public {
        vm.prank(everest);
        inventory.updateSnapshot(root);
        assertFalse(inventory.verifyItem(alpha, ATORVASTATIN, 3, keccak256("s0"), _proofForLeaf0()));
    }

    function test_revert_update_unverified() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PharmacyInventory.NotVerifiedPharmacy.selector, outsider));
        inventory.updateSnapshot(root);
    }

    function test_revert_update_zeroRoot() public {
        vm.prank(everest);
        vm.expectRevert(PharmacyInventory.ZeroValue.selector);
        inventory.updateSnapshot(bytes32(0));
    }

    function test_revert_update_whenPaused() public {
        vm.prank(admin);
        inventory.pause();
        vm.prank(everest);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        inventory.updateSnapshot(root);
    }

    /// The hand-written Yul must match the readable Solidity definition for every input.
    function testFuzz_leafFor_matchesSolidity(bytes32 drugCode, uint8 band, bytes32 salt) public view {
        bytes32 expected = keccak256(bytes.concat(keccak256(abi.encode(drugCode, band, salt))));
        assertEq(inventory.leafFor(drugCode, band, salt), expected);
    }

    /// A leaf can never be confused with an internal node: inner nodes are 64-byte preimages, leaves double-hash.
    function testFuzz_internalNodeIsNotAValidLeaf(bytes32 salt) public {
        vm.prank(everest);
        inventory.updateSnapshot(root);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = _hashPair(leaves[2], leaves[3]);
        // Try to pass the left internal node off as a leaf by brute-forcing inputs: never verifies.
        assertFalse(inventory.verifyItem(everest, _hashPair(leaves[0], leaves[1]), 0, salt, proof));
    }
}
