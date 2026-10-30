// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {IVerifyProofAggregation} from "../../../contracts/interfaces/IVerifyProofAggregation.sol";

/// @notice Stand-in for zkVerify's aggregation contract: stores roots and checks positional keccak Merkle paths
///         (left/right decided by the leaf index, as in zkVerify's binary Merkle tree for full trees).
contract MockZkVerifyAggregation is IVerifyProofAggregation {
    mapping(uint256 domainId => mapping(uint256 aggregationId => bytes32)) public roots;

    function post(uint256 domainId, uint256 aggregationId, bytes32 root) external {
        roots[domainId][aggregationId] = root;
    }

    function verifyProofAggregation(
        uint256 domainId,
        uint256 aggregationId,
        bytes32 leaf,
        bytes32[] calldata merklePath,
        uint256 leafCount,
        uint256 index
    ) external view returns (bool) {
        bytes32 root = roots[domainId][aggregationId];
        if (root == bytes32(0) || index >= leafCount) return false;
        bytes32 node = leaf;
        for (uint256 i; i < merklePath.length; ++i) {
            node = index % 2 == 0
                ? keccak256(abi.encodePacked(node, merklePath[i]))
                : keccak256(abi.encodePacked(merklePath[i], node));
            index /= 2;
        }
        return node == root;
    }

    /// Helper: root of a 2-leaf tree.
    function pairRoot(bytes32 left, bytes32 right) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(left, right));
    }
}
