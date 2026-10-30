// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Base} from "../utils/Base.t.sol";
import {PharmacyMatchingEngine} from "../../../contracts/PharmacyMatchingEngine.sol";
import {EngineHandler} from "./EngineHandler.sol";

/// @notice System-level safety properties that must hold after any sequence of actions.
contract EngineInvariantTest is Base {
    EngineHandler internal handler;

    function setUp() public override {
        super.setUp();
        address[] memory actors = new address[](4);
        actors[0] = everest;
        actors[1] = alpha;
        actors[2] = makeAddr("boots");
        actors[3] = makeAddr("midway");
        _register(actors[2]);
        _register(actors[3]);

        handler = new EngineHandler(engine, ticket, verifier, actors);
        targetContract(address(handler));
    }

    /// Guards against a vacuous run: the fuzzer must actually reach the interesting states.
    function afterInvariant() public view {
        assertGt(handler.ghostFulfilled(), 0, "no fulfilment reached");
    }

    /// A nullifier can never be spent twice.
    function invariant_noReplay() public view {
        assertEq(handler.ghostReplaySucceeded(), 0);
    }

    /// Every fulfilment consumed exactly one fresh nullifier.
    function invariant_nullifiersMatchFulfilments() public view {
        uint256 n = handler.ghostFulfilled();
        for (uint256 i; i < n; ++i) {
            assertTrue(engine.nullifierUsed(handler.usedNullifiers(i)));
        }
    }

    /// Outstanding tickets == listings that are Fulfilled but not yet Completed.
    /// Also checks per listing: a ticket exists iff status is Fulfilled, held by someone other than the recipient.
    function invariant_ticketsMatchStatus() public view {
        uint256 total = engine.nextListingId();
        uint256 fulfilledNow;
        for (uint256 id; id < total; ++id) {
            (address supplier,, PharmacyMatchingEngine.Status status,) = engine.listings(id);
            address recipient = ticket.recipientOf(id);
            if (status == PharmacyMatchingEngine.Status.Fulfilled) {
                fulfilledNow++;
                assertEq(ticket.ownerOf(id), supplier);
                assertTrue(recipient != address(0) && recipient != supplier);
            } else {
                assertEq(recipient, address(0));
            }
            assertTrue(status != PharmacyMatchingEngine.Status.None); // every issued ID is a real listing
        }
        assertEq(fulfilledNow, handler.ghostFulfilled() - handler.ghostCompleted());
    }

    /// The listing counter accounts for every outcome; nothing is lost or double-counted.
    function invariant_accounting() public view {
        uint256 total = engine.nextListingId();
        uint256 active;
        for (uint256 id; id < total; ++id) {
            (,, PharmacyMatchingEngine.Status status,) = engine.listings(id);
            if (status == PharmacyMatchingEngine.Status.Active) active++;
        }
        assertEq(active + handler.ghostCancelled() + handler.ghostFulfilled(), total);
    }
}
