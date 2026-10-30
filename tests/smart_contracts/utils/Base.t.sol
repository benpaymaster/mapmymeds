// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Test} from "forge-std/Test.sol";
import {PharmacyRegistry} from "../../../contracts/PharmacyRegistry.sol";
import {PharmacyMatchingEngine} from "../../../contracts/PharmacyMatchingEngine.sol";
import {PharmacyInventory} from "../../../contracts/PharmacyInventory.sol";
import {SettlementTicket} from "../../../contracts/SettlementTicket.sol";
import {IPharmacyRegistry} from "../../../contracts/interfaces/IPharmacyRegistry.sol";
import {ISettlementTicket} from "../../../contracts/interfaces/ISettlementTicket.sol";
import {IComplianceVerifier} from "../../../contracts/interfaces/IComplianceVerifier.sol";
import {MockComplianceVerifier} from "./MockComplianceVerifier.sol";

/// @notice Deploys the full system the same way the deploy script does.
abstract contract Base is Test {
    PharmacyRegistry internal registry;
    SettlementTicket internal ticket;
    PharmacyMatchingEngine internal engine;
    PharmacyInventory internal inventory;
    MockComplianceVerifier internal verifier;

    address internal admin = makeAddr("admin");
    uint256 internal attestorKey = 0xA77E57;
    address internal attestor;

    address internal everest = makeAddr("everest"); // supplier
    address internal alpha = makeAddr("alpha"); // recipient
    address internal outsider = makeAddr("outsider"); // never verified

    bytes32 internal constant PREMISES = keccak256("GPhC-1234567|salt");
    bytes32 internal constant COMMITMENT = keccak256("atorvastatin|schedule-POM|100|salt");

    function setUp() public virtual {
        vm.warp(1_790_000_000); // a realistic 2026 timestamp
        attestor = vm.addr(attestorKey);

        registry = new PharmacyRegistry(admin, attestor);
        ticket = new SettlementTicket(admin, IPharmacyRegistry(address(registry)));
        verifier = new MockComplianceVerifier();
        engine = new PharmacyMatchingEngine(
            admin,
            IPharmacyRegistry(address(registry)),
            ISettlementTicket(address(ticket)),
            IComplianceVerifier(address(verifier))
        );
        inventory = new PharmacyInventory(admin, IPharmacyRegistry(address(registry)));

        vm.prank(admin);
        ticket.setEngine(address(engine));

        _register(everest);
        _register(alpha);
    }

    // ---------------------------------------------------------------- helpers

    function _r(address pharmacy, uint64 validUntil, uint256 nonce, uint256 deadline)
        internal
        pure
        returns (PharmacyRegistry.Registration memory)
    {
        return PharmacyRegistry.Registration({
            pharmacy: pharmacy,
            premisesCommitment: PREMISES,
            label: "",
            validUntil: validUntil,
            nonce: nonce,
            deadline: deadline
        });
    }

    function _signReg(uint256 key, PharmacyRegistry.Registration memory reg) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, registry.registrationDigest(reg));
        return abi.encodePacked(r, s, v);
    }

    function _sign(uint256 key, address pharmacy, uint64 validUntil, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _signReg(key, _r(pharmacy, validUntil, nonce, deadline));
    }

    function _register(address pharmacy) internal {
        uint64 validUntil = uint64(block.timestamp + 180 days);
        uint256 nonce = registry.nonces(pharmacy);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(attestorKey, pharmacy, validUntil, nonce, deadline);
        registry.register(_r(pharmacy, validUntil, nonce, deadline), sig);
    }

    function _list(address supplier) internal returns (uint256 id) {
        vm.prank(supplier);
        id = engine.createListing(COMMITMENT, uint64(block.timestamp + 7 days));
    }

    function _nullifier(uint256 id, address recipient) internal pure returns (bytes32) {
        return keccak256(abi.encode("nullifier", id, recipient));
    }

    function _fulfil(uint256 id, address recipient) internal returns (bytes32 n) {
        (,,, bytes32 commitment) = engine.listings(id);
        n = _nullifier(id, recipient);
        bytes memory proof = verifier.proofFor(commitment, n, recipient);
        vm.prank(recipient);
        engine.fulfillMatch(id, n, proof);
    }
}
