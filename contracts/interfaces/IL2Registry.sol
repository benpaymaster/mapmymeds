// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

/// @title IL2Registry
/// @notice Subset of Durin's ENS L2Registry (github.com/namestonehq/durin) used by MapMyMeds.
/// @dev A Durin registry is deployed per parent name (e.g. mapmymeds.eth) through the L2RegistryFactory on Base,
///      and resolves on L1 ENS through CCIP-Read. Approved registrars can mint subnames.
interface IL2Registry {
    function baseNode() external view returns (bytes32);

    function makeNode(bytes32 parentNode, string calldata label) external pure returns (bytes32);

    function createSubnode(bytes32 node, string calldata label, address owner, bytes[] calldata data)
        external
        returns (bytes32);

    function setAddr(bytes32 node, uint256 coinType, bytes calldata a) external;

    function ownerOf(uint256 tokenId) external view returns (address);
}
