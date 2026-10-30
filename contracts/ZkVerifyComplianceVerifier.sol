// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {IComplianceVerifier} from "./interfaces/IComplianceVerifier.sol";
import {IVerifyProofAggregation} from "./interfaces/IVerifyProofAggregation.sol";

/// @title ZkVerifyComplianceVerifier
/// @author Adegbenga (Ben) Ogungbeje
/// @notice Adapter that lets the matching engine accept transfer-compliance proofs verified on zkVerify.
/// @dev Why zkVerify: verifying an UltraHonk proof directly on Base costs millions of gas. zkVerify verifies it
///      on its own chain, batches many proofs into a Merkle root, and posts that root to Base. On Base we only
///      check a Merkle inclusion proof for our statement, which costs a few thousand gas.
///
///      Statement (the Merkle leaf), as defined by zkVerify's verifier pallets:
///        leaf = keccak256( keccak256("ultrahonk") || vkHash || versionHash || keccak256(publicInputs) )
///      - vkHash: keccak256 of the circuit's verification key, fixed at deployment, so only proofs of *our*
///        circuit are accepted. A proof of any other circuit produces a different leaf.
///      - versionHash: sha256 of zkVerify's UltraHonk version tag (e.g. "ultrahonk:v3.0" for bb 3.0.x),
///        a constructor argument because it changes with prover versions.
///      - publicInputs: the 32-byte big-endian field elements concatenated, in circuit order:
///        [commitment, nullifier, recipient]. No endianness swap is needed for UltraHonk.
///
///      `proof` passed through the engine is ABI-encoded aggregation data from zkVerify's receipt:
///        abi.encode(uint256 aggregationId, bytes32[] merklePath, uint256 leafCount, uint256 index)
///      Upgrading the circuit means deploying a new adapter and calling `engine.setVerifier`.
contract ZkVerifyComplianceVerifier is IComplianceVerifier {
    /// @notice keccak256 of zkVerify's UltraHonk context string.
    bytes32 public constant PROVING_SYSTEM_ID = keccak256(abi.encodePacked("ultrahonk"));

    IVerifyProofAggregation public immutable zkVerify;
    uint256 public immutable domainId;
    bytes32 public immutable vkHash;
    bytes32 public immutable versionHash;

    error ZeroAddress();
    error ZeroValue();

    constructor(IVerifyProofAggregation zkVerify_, uint256 domainId_, bytes32 vkHash_, bytes32 versionHash_) {
        if (address(zkVerify_) == address(0)) revert ZeroAddress();
        if (vkHash_ == bytes32(0)) revert ZeroValue();
        zkVerify = zkVerify_;
        domainId = domainId_;
        vkHash = vkHash_;
        versionHash = versionHash_;
    }

    /// @notice The leaf zkVerify will have aggregated for a proof with these public inputs.
    /// @dev Kept in plain Solidity, mirroring zkVerify's documented formula, so auditors can compare line by line.
    function statementFor(bytes32[] calldata publicInputs) public view returns (bytes32) {
        // forge-lint: disable-next-line(asm-keccak256)
        bytes32 pubsHash = keccak256(abi.encodePacked(publicInputs));
        // forge-lint: disable-next-line(asm-keccak256)
        return keccak256(abi.encodePacked(PROVING_SYSTEM_ID, vkHash, versionHash, pubsHash));
    }

    /// @inheritdoc IComplianceVerifier
    /// @dev Returns false for inputs too short to decode or an out-of-range index; malformed encodings revert.
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        if (proof.length < 128) return false; // too short to hold the ABI-encoded aggregation data
        (uint256 aggregationId, bytes32[] memory merklePath, uint256 leafCount, uint256 index) =
            abi.decode(proof, (uint256, bytes32[], uint256, uint256));
        if (index >= leafCount) return false;

        return zkVerify.verifyProofAggregation(
            domainId, aggregationId, statementFor(publicInputs), merklePath, leafCount, index
        );
    }
}
