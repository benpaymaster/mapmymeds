// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {IComplianceVerifier} from "../../../contracts/interfaces/IComplianceVerifier.sol";

/// @notice Test double for the Noir/UltraHonk verifier.
/// @dev A "proof" is valid only if it equals abi.encode(publicInputs). That mirrors the property that matters:
///      a proof is bound to its exact public inputs, including the caller's address, so it cannot be reused
///      by anyone else or for another listing. The real verifier is exercised in ComplianceVerifier.t.sol.
contract MockComplianceVerifier is IComplianceVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external pure returns (bool) {
        return keccak256(proof) == keccak256(abi.encode(publicInputs));
    }

    function proofFor(bytes32 commitment, bytes32 nullifier, address recipient) external pure returns (bytes memory) {
        bytes32[] memory inputs = new bytes32[](3);
        inputs[0] = commitment;
        inputs[1] = nullifier;
        inputs[2] = bytes32(uint256(uint160(recipient)));
        return abi.encode(inputs);
    }
}
