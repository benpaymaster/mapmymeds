// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

/// @title IVerifyProofAggregation
/// @notice zkVerify's aggregation contract, deployed on Base and other EVM chains. It stores Merkle roots of
///         batches of proofs that zkVerify has already verified, and checks inclusion of one statement.
/// @dev Addresses per network: https://docs.zkverify.io/overview/contract-addresses
interface IVerifyProofAggregation {
    function verifyProofAggregation(
        uint256 domainId,
        uint256 aggregationId,
        bytes32 leaf,
        bytes32[] calldata merklePath,
        uint256 leafCount,
        uint256 index
    ) external view returns (bool);
}
