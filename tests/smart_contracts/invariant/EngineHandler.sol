// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Test} from "forge-std/Test.sol";
import {PharmacyMatchingEngine} from "../../../contracts/PharmacyMatchingEngine.sol";
import {SettlementTicket} from "../../../contracts/SettlementTicket.sol";
import {MockComplianceVerifier} from "../utils/MockComplianceVerifier.sol";

/// @notice Drives the engine with random but valid-looking actions from a fixed set of verified pharmacies,
///         plus deliberate attack attempts, and keeps ghost variables to check against.
contract EngineHandler is Test {
    PharmacyMatchingEngine internal engine;
    SettlementTicket internal ticket;
    MockComplianceVerifier internal verifier;
    address[] internal actors;

    // Ghost state
    uint256 public ghostFulfilled; // fulfilments that succeeded (includes later-completed)
    uint256 public ghostCompleted;
    uint256 public ghostCancelled;
    uint256 public ghostReplaySucceeded; // must stay 0
    bytes32[] public usedNullifiers;

    constructor(
        PharmacyMatchingEngine engine_,
        SettlementTicket ticket_,
        MockComplianceVerifier v,
        address[] memory actors_
    ) {
        engine = engine_;
        ticket = ticket_;
        verifier = v;
        actors = actors_;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _existing(uint256 seed) internal view returns (uint256 id, bool ok) {
        uint256 n = engine.nextListingId();
        if (n == 0) return (0, false);
        return (seed % n, true);
    }

    /// Scans from a random start for a listing in `want` state, so actions land on meaningful states.
    function _find(uint256 seed, PharmacyMatchingEngine.Status want) internal view returns (uint256 id, bool ok) {
        uint256 n = engine.nextListingId();
        for (uint256 i; i < n; ++i) {
            id = (seed % n + i) % n;
            (,, PharmacyMatchingEngine.Status status,) = engine.listings(id);
            if (status == want && (want != PharmacyMatchingEngine.Status.Active || engine.isOpen(id))) {
                return (id, true);
            }
        }
        return (0, false);
    }

    function create(uint256 actorSeed, bytes32 commitment, uint64 offset) external {
        if (commitment == bytes32(0)) commitment = keccak256(abi.encode(actorSeed));
        offset = uint64(bound(offset, 1, engine.MAX_LISTING_DURATION()));
        vm.prank(_actor(actorSeed));
        engine.createListing(commitment, uint64(block.timestamp) + offset);
    }

    function cancel(uint256 idSeed) external {
        (uint256 id, bool ok) = _find(idSeed, PharmacyMatchingEngine.Status.Active);
        if (!ok) return;
        (address supplier,, PharmacyMatchingEngine.Status status,) = engine.listings(id);
        if (status != PharmacyMatchingEngine.Status.Active) return;
        vm.prank(supplier);
        engine.cancelListing(id);
        ghostCancelled++;
    }

    function fulfil(uint256 idSeed, uint256 actorSeed, bytes32 salt) external {
        (uint256 id, bool ok) = _find(idSeed, PharmacyMatchingEngine.Status.Active);
        if (!ok) {
            // Bootstrap: no open listing yet, so a different pharmacy lists one first.
            vm.prank(_actor((actorSeed % actors.length) + 1));
            id = engine.createListing(keccak256(abi.encode(salt, idSeed)), uint64(block.timestamp + 1 days));
        }
        (address supplier,,, bytes32 commitment) = engine.listings(id);
        address recipient = _actor(actorSeed);
        if (recipient == supplier) recipient = _actor((actorSeed % actors.length) + 1); // self-fulfilment is unit-tested separately
        bytes32 nullifier = keccak256(abi.encode(salt, recipient, id));
        bytes memory proof = verifier.proofFor(commitment, nullifier, recipient);
        if (engine.nullifierUsed(nullifier)) return; // astronomically unlikely salt collision
        vm.prank(recipient);
        engine.fulfillMatch(id, nullifier, proof); // a valid claim must never revert
        ghostFulfilled++;
        usedNullifiers.push(nullifier);
    }

    /// Attack: replay an already-used nullifier against a random listing.
    function replay(uint256 idSeed, uint256 nSeed, uint256 actorSeed) external {
        if (usedNullifiers.length == 0) return;
        (uint256 id, bool ok) = _existing(idSeed);
        if (!ok) return;
        address recipient = _actor(actorSeed);
        bytes32 nullifier = usedNullifiers[nSeed % usedNullifiers.length];
        (,,, bytes32 commitment) = engine.listings(id);
        bytes memory proof = verifier.proofFor(commitment, nullifier, recipient);
        vm.prank(recipient);
        try engine.fulfillMatch(id, nullifier, proof) {
            ghostReplaySucceeded++;
        } catch {}
    }

    function confirm(uint256 idSeed) external {
        (uint256 id, bool ok) = _find(idSeed, PharmacyMatchingEngine.Status.Fulfilled);
        if (!ok) return;
        (,, PharmacyMatchingEngine.Status status,) = engine.listings(id);
        if (status != PharmacyMatchingEngine.Status.Fulfilled) return;
        vm.prank(ticket.recipientOf(id));
        engine.confirmDelivery(id);
        ghostCompleted++;
    }

    function warp(uint32 secondsForward) external {
        vm.warp(block.timestamp + bound(secondsForward, 0, 12 hours));
    }
}
