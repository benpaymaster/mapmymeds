// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Base} from "./utils/Base.t.sol";
import {PharmacyMatchingEngine} from "../../contracts/PharmacyMatchingEngine.sol";
import {ZkVerifyComplianceVerifier} from "../../contracts/ZkVerifyComplianceVerifier.sol";
import {IComplianceVerifier} from "../../contracts/interfaces/IComplianceVerifier.sol";
import {IVerifyProofAggregation} from "../../contracts/interfaces/IVerifyProofAggregation.sol";
import {MockZkVerifyAggregation} from "./utils/MockZkVerifyAggregation.sol";

/// @notice End-to-end: engine -> zkVerify adapter -> aggregation contract, using the public values produced by
///         the real Noir circuit's example witness (circuits/transfer_compliance/Prover.toml).
contract ZkVerifyComplianceVerifierTest is Base {
    // Output of `nargo test print_example_inputs --show-output`
    bytes32 internal constant CIRCUIT_COMMITMENT = 0x0dc893058f58ff8771ef7e678a4bc6887819165798d7ed66db8050de8e2dcdd9;
    bytes32 internal constant CIRCUIT_NULLIFIER = 0x09c1dbc03503add04fdef3d86afa397f795308c122075ae8db09c6b87125eab1;

    uint256 internal constant DOMAIN = 0;
    uint256 internal constant AGG_ID = 42;
    bytes32 internal constant VK_HASH = keccak256("transfer_compliance vk");
    bytes32 internal versionHash = sha256(abi.encodePacked("ultrahonk:v3.0"));

    MockZkVerifyAggregation internal zkv;
    ZkVerifyComplianceVerifier internal adapter;
    bytes32 internal otherLeaf = keccak256("someone else's proof in the same batch");

    function setUp() public override {
        super.setUp();
        // The circuit's example recipient is this suite's `alpha` address.
        assertEq(alpha, 0x84BfbA8F12eb09a3963B62c55AD2893343e93EcC);

        zkv = new MockZkVerifyAggregation();
        adapter = new ZkVerifyComplianceVerifier(IVerifyProofAggregation(address(zkv)), DOMAIN, VK_HASH, versionHash);
        vm.prank(admin);
        engine.setVerifier(IComplianceVerifier(address(adapter)));
    }

    function _inputs(bytes32 c, bytes32 n, address r) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](3);
        p[0] = c;
        p[1] = n;
        p[2] = bytes32(uint256(uint160(r)));
    }

    /// Posts a 2-leaf aggregation containing our statement at index 0 and returns the encoded receipt data.
    function _aggregate(bytes32 statement) internal returns (bytes memory receipt) {
        zkv.post(DOMAIN, AGG_ID, zkv.pairRoot(statement, otherLeaf));
        bytes32[] memory path = new bytes32[](1);
        path[0] = otherLeaf;
        receipt = abi.encode(AGG_ID, path, uint256(2), uint256(0));
    }

    function test_statementFormula() public view {
        bytes32[] memory p = _inputs(CIRCUIT_COMMITMENT, CIRCUIT_NULLIFIER, alpha);
        bytes32 expected = keccak256(
            abi.encodePacked(
                keccak256("ultrahonk"),
                VK_HASH,
                versionHash,
                keccak256(abi.encodePacked(CIRCUIT_COMMITMENT, CIRCUIT_NULLIFIER, bytes32(uint256(uint160(alpha)))))
            )
        );
        assertEq(adapter.statementFor(p), expected);
    }

    function test_endToEnd_fulfilWithZkVerifyReceipt() public {
        vm.prank(everest);
        uint256 id = engine.createListing(CIRCUIT_COMMITMENT, uint64(block.timestamp + 7 days));
        bytes memory receipt = _aggregate(adapter.statementFor(_inputs(CIRCUIT_COMMITMENT, CIRCUIT_NULLIFIER, alpha)));

        vm.prank(alpha);
        engine.fulfillMatch(id, CIRCUIT_NULLIFIER, receipt);
        assertEq(ticket.ownerOf(id), everest);
        assertEq(ticket.recipientOf(id), alpha);
    }

    function test_revert_stolenReceipt() public {
        address thief = makeAddr("thief");
        _register(thief);
        vm.prank(everest);
        uint256 id = engine.createListing(CIRCUIT_COMMITMENT, uint64(block.timestamp + 7 days));
        bytes memory receipt = _aggregate(adapter.statementFor(_inputs(CIRCUIT_COMMITMENT, CIRCUIT_NULLIFIER, alpha)));

        vm.prank(thief);
        vm.expectRevert(PharmacyMatchingEngine.InvalidProof.selector);
        engine.fulfillMatch(id, CIRCUIT_NULLIFIER, receipt);
    }

    function test_revert_proofOfDifferentCircuit() public {
        ZkVerifyComplianceVerifier otherCircuit = new ZkVerifyComplianceVerifier(
            IVerifyProofAggregation(address(zkv)), DOMAIN, keccak256("another circuit vk"), versionHash
        );
        bytes32[] memory p = _inputs(CIRCUIT_COMMITMENT, CIRCUIT_NULLIFIER, alpha);
        bytes memory receipt = _aggregate(otherCircuit.statementFor(p)); // valid on zkVerify, but not our circuit
        assertFalse(adapter.verify(receipt, p));
    }

    function test_revert_wrongAggregationOrIndex() public {
        bytes32[] memory p = _inputs(CIRCUIT_COMMITMENT, CIRCUIT_NULLIFIER, alpha);
        _aggregate(adapter.statementFor(p));
        bytes32[] memory path = new bytes32[](1);
        path[0] = otherLeaf;
        assertFalse(adapter.verify(abi.encode(uint256(7), path, uint256(2), uint256(0)), p)); // unknown aggregation
        assertFalse(adapter.verify(abi.encode(AGG_ID, path, uint256(2), uint256(1)), p)); // wrong position
        assertFalse(adapter.verify(abi.encode(AGG_ID, path, uint256(2), uint256(2)), p)); // index out of range
    }

    function test_shortProofReturnsFalse() public view {
        assertFalse(adapter.verify(hex"1234", _inputs(CIRCUIT_COMMITMENT, CIRCUIT_NULLIFIER, alpha)));
    }

    function testFuzz_anyChangedInputFails(uint8 which, bytes32 noise) public {
        vm.assume(noise != bytes32(0));
        bytes32[] memory p = _inputs(CIRCUIT_COMMITMENT, CIRCUIT_NULLIFIER, alpha);
        bytes memory receipt = _aggregate(adapter.statementFor(p));
        p[which % 3] = p[which % 3] ^ noise;
        assertFalse(adapter.verify(receipt, p));
    }

    function test_revert_constructorZeroValues() public {
        vm.expectRevert(ZkVerifyComplianceVerifier.ZeroAddress.selector);
        new ZkVerifyComplianceVerifier(IVerifyProofAggregation(address(0)), DOMAIN, VK_HASH, versionHash);
        vm.expectRevert(ZkVerifyComplianceVerifier.ZeroValue.selector);
        new ZkVerifyComplianceVerifier(IVerifyProofAggregation(address(zkv)), DOMAIN, bytes32(0), versionHash);
    }
}
