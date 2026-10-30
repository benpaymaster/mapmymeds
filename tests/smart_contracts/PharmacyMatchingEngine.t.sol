// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Base} from "./utils/Base.t.sol";
import {PharmacyMatchingEngine} from "../../contracts/PharmacyMatchingEngine.sol";
import {IComplianceVerifier} from "../../contracts/interfaces/IComplianceVerifier.sol";
import {MockComplianceVerifier} from "./utils/MockComplianceVerifier.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract PharmacyMatchingEngineTest is Base {
    // ------------------------------------------------------------------ createListing

    function test_createListing_storesPackedListing() public {
        uint64 expiry = uint64(block.timestamp + 7 days);
        vm.prank(everest);
        uint256 id = engine.createListing(COMMITMENT, expiry);

        (address supplier, uint64 expiresAt, PharmacyMatchingEngine.Status status, bytes32 commitment) =
            engine.listings(id);
        assertEq(id, 0);
        assertEq(supplier, everest);
        assertEq(expiresAt, expiry);
        assertEq(uint8(status), uint8(PharmacyMatchingEngine.Status.Active));
        assertEq(commitment, COMMITMENT);
        assertTrue(engine.isOpen(id));
    }

    function test_listingUsesTwoStorageSlots() public {
        uint256 id = _list(everest);
        bytes32 base = keccak256(abi.encode(id, uint256(3))); // `listings` is slot 3: see `forge inspect PharmacyMatchingEngine storageLayout`
        bytes32 slot0 = vm.load(address(engine), base);
        bytes32 slot1 = vm.load(address(engine), bytes32(uint256(base) + 1));
        bytes32 slot2 = vm.load(address(engine), bytes32(uint256(base) + 2));
        assertEq(address(uint160(uint256(slot0))), everest); // supplier, expiry and status share slot 0
        assertEq(slot1, COMMITMENT);
        assertEq(slot2, bytes32(0)); // nothing spills into a third slot
    }

    function test_revert_createListing_unverified() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PharmacyMatchingEngine.NotVerifiedPharmacy.selector, outsider));
        engine.createListing(COMMITMENT, uint64(block.timestamp + 1 days));
    }

    function test_revert_createListing_zeroCommitment() public {
        vm.prank(everest);
        vm.expectRevert(PharmacyMatchingEngine.ZeroValue.selector);
        engine.createListing(bytes32(0), uint64(block.timestamp + 1 days));
    }

    function testFuzz_revert_createListing_badExpiry(uint64 expiry) public {
        vm.assume(expiry <= block.timestamp || expiry > block.timestamp + engine.MAX_LISTING_DURATION());
        vm.prank(everest);
        vm.expectRevert(abi.encodeWithSelector(PharmacyMatchingEngine.InvalidExpiry.selector, expiry));
        engine.createListing(COMMITMENT, expiry);
    }

    function testFuzz_createListing_validExpiry(uint64 offset) public {
        offset = uint64(bound(offset, 1, engine.MAX_LISTING_DURATION()));
        vm.prank(everest);
        uint256 id = engine.createListing(COMMITMENT, uint64(block.timestamp) + offset);
        assertTrue(engine.isOpen(id));
    }

    function test_revert_createListing_whenPaused() public {
        vm.prank(admin);
        engine.pause();
        vm.prank(everest);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        engine.createListing(COMMITMENT, uint64(block.timestamp + 1 days));
    }

    // ------------------------------------------------------------------ cancelListing

    function test_cancel_bySupplier() public {
        uint256 id = _list(everest);
        vm.prank(everest);
        engine.cancelListing(id);
        assertFalse(engine.isOpen(id));
    }

    function test_cancel_allowedWhilePaused() public {
        uint256 id = _list(everest);
        vm.prank(admin);
        engine.pause();
        vm.prank(everest);
        engine.cancelListing(id); // suppliers can always withdraw
    }

    function test_revert_cancel_byOther() public {
        uint256 id = _list(everest);
        vm.prank(alpha);
        vm.expectRevert(abi.encodeWithSelector(PharmacyMatchingEngine.NotSupplier.selector, id));
        engine.cancelListing(id);
    }

    function test_revert_cancel_nonexistent() public {
        vm.prank(everest);
        vm.expectRevert(abi.encodeWithSelector(PharmacyMatchingEngine.NotSupplier.selector, 99));
        engine.cancelListing(99);
    }

    function test_revert_cancel_twice() public {
        uint256 id = _list(everest);
        vm.startPrank(everest);
        engine.cancelListing(id);
        vm.expectRevert(
            abi.encodeWithSelector(
                PharmacyMatchingEngine.NotActive.selector, id, PharmacyMatchingEngine.Status.Cancelled
            )
        );
        engine.cancelListing(id);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ fulfillMatch

    function test_fulfil_mintsTicketToSupplier() public {
        uint256 id = _list(everest);
        bytes32 n = _fulfil(id, alpha);

        (,, PharmacyMatchingEngine.Status status,) = engine.listings(id);
        assertEq(uint8(status), uint8(PharmacyMatchingEngine.Status.Fulfilled));
        assertTrue(engine.nullifierUsed(n));
        assertEq(ticket.ownerOf(id), everest);
        assertEq(ticket.recipientOf(id), alpha);
    }

    function test_revert_fulfil_invalidProof() public {
        uint256 id = _list(everest);
        vm.prank(alpha);
        vm.expectRevert(PharmacyMatchingEngine.InvalidProof.selector);
        engine.fulfillMatch(id, _nullifier(id, alpha), hex"deadbeef");
    }

    /// A proof copied from the mempool by another verified pharmacy must not work for them.
    function test_revert_fulfil_frontRunWithStolenProof() public {
        address thief = makeAddr("thief");
        _register(thief);
        uint256 id = _list(everest);
        bytes32 n = _nullifier(id, alpha);
        bytes memory alphasProof = verifier.proofFor(COMMITMENT, n, alpha);

        vm.prank(thief);
        vm.expectRevert(PharmacyMatchingEngine.InvalidProof.selector);
        engine.fulfillMatch(id, n, alphasProof);
    }

    function test_revert_fulfil_proofForOtherListing() public {
        uint256 id0 = _list(everest);
        vm.prank(everest);
        uint256 id1 = engine.createListing(keccak256("other"), uint64(block.timestamp + 1 days));
        bytes32 n = _nullifier(id0, alpha);
        bytes memory proofFor0 = verifier.proofFor(COMMITMENT, n, alpha);

        vm.prank(alpha);
        vm.expectRevert(PharmacyMatchingEngine.InvalidProof.selector);
        engine.fulfillMatch(id1, n, proofFor0);
    }

    function test_revert_fulfil_nullifierReplay() public {
        uint256 id0 = _list(everest);
        uint256 id1 = _list(everest); // same commitment, e.g. relisted stock
        bytes32 n = _fulfil(id0, alpha);
        bytes memory proof = verifier.proofFor(COMMITMENT, n, alpha);

        vm.prank(alpha);
        vm.expectRevert(abi.encodeWithSelector(PharmacyMatchingEngine.NullifierAlreadyUsed.selector, n));
        engine.fulfillMatch(id1, n, proof);
    }

    function test_revert_fulfil_twice() public {
        uint256 id = _list(everest);
        _fulfil(id, alpha);
        address boots = makeAddr("boots");
        _register(boots);
        bytes32 n = _nullifier(id, boots);
        bytes memory proof = verifier.proofFor(COMMITMENT, n, boots);
        vm.prank(boots);
        vm.expectRevert(
            abi.encodeWithSelector(
                PharmacyMatchingEngine.NotActive.selector, id, PharmacyMatchingEngine.Status.Fulfilled
            )
        );
        engine.fulfillMatch(id, n, proof);
    }

    function test_revert_fulfil_ownListing() public {
        uint256 id = _list(everest);
        bytes32 n = _nullifier(id, everest);
        bytes memory proof = verifier.proofFor(COMMITMENT, n, everest);
        vm.prank(everest);
        vm.expectRevert(abi.encodeWithSelector(PharmacyMatchingEngine.SelfFulfilment.selector, id));
        engine.fulfillMatch(id, n, proof);
    }

    function test_revert_fulfil_expired() public {
        uint256 id = _list(everest);
        (, uint64 expiresAt,,) = engine.listings(id);
        vm.warp(uint256(expiresAt) + 1);
        bytes32 n = _nullifier(id, alpha);
        bytes memory proof = verifier.proofFor(COMMITMENT, n, alpha);
        vm.prank(alpha);
        vm.expectRevert(abi.encodeWithSelector(PharmacyMatchingEngine.ListingExpired.selector, id));
        engine.fulfillMatch(id, n, proof);
        assertFalse(engine.isOpen(id));
    }

    function test_revert_fulfil_supplierRevokedAfterListing() public {
        uint256 id = _list(everest);
        vm.prank(admin);
        registry.revoke(everest);
        bytes32 n = _nullifier(id, alpha);
        bytes memory proof = verifier.proofFor(COMMITMENT, n, alpha);
        vm.prank(alpha);
        vm.expectRevert(abi.encodeWithSelector(PharmacyMatchingEngine.NotVerifiedPharmacy.selector, everest));
        engine.fulfillMatch(id, n, proof);
    }

    function test_revert_fulfil_unverifiedCaller() public {
        uint256 id = _list(everest);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PharmacyMatchingEngine.NotVerifiedPharmacy.selector, outsider));
        engine.fulfillMatch(id, bytes32(0), "");
    }

    // ------------------------------------------------------------------ confirmDelivery

    function test_confirmDelivery_completesAndBurns() public {
        uint256 id = _list(everest);
        _fulfil(id, alpha);
        vm.prank(alpha);
        engine.confirmDelivery(id);

        (,, PharmacyMatchingEngine.Status status,) = engine.listings(id);
        assertEq(uint8(status), uint8(PharmacyMatchingEngine.Status.Completed));
        assertEq(ticket.balanceOf(everest), 0);
        assertEq(ticket.recipientOf(id), address(0));
    }

    function test_revert_confirmDelivery_notRecipient() public {
        uint256 id = _list(everest);
        _fulfil(id, alpha);
        vm.prank(everest); // supplier cannot mark its own delivery as received
        vm.expectRevert(abi.encodeWithSelector(PharmacyMatchingEngine.NotRecipient.selector, id));
        engine.confirmDelivery(id);
    }

    function test_revert_confirmDelivery_beforeFulfilment() public {
        uint256 id = _list(everest);
        vm.prank(alpha);
        vm.expectRevert(
            abi.encodeWithSelector(PharmacyMatchingEngine.NotActive.selector, id, PharmacyMatchingEngine.Status.Active)
        );
        engine.confirmDelivery(id);
    }

    // ------------------------------------------------------------------ admin

    function test_setVerifier_onlyOwner() public {
        MockComplianceVerifier v2 = new MockComplianceVerifier();
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        engine.setVerifier(IComplianceVerifier(address(v2)));

        vm.prank(admin);
        engine.setVerifier(IComplianceVerifier(address(v2)));
        assertEq(address(engine.verifier()), address(v2));
    }

    function test_revert_setVerifier_zero() public {
        vm.prank(admin);
        vm.expectRevert(PharmacyMatchingEngine.ZeroAddress.selector);
        engine.setVerifier(IComplianceVerifier(address(0)));
    }
}
