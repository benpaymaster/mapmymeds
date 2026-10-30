// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {IL2Registry} from "../../../contracts/interfaces/IL2Registry.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @notice Minimal stand-in for Durin's L2Registry with the same node maths, registrar permissions,
///         "name taken" behaviour and `_safeMint` receiver callback.
contract MockL2Registry is IL2Registry {
    bytes32 public immutable baseNode = keccak256(abi.encodePacked(bytes32(0), keccak256("mapmymeds")));
    mapping(address => bool) public registrars;
    mapping(uint256 => address) internal owners;
    mapping(bytes32 node => mapping(uint256 coinType => bytes)) public addrs;
    mapping(bytes32 node => string) public labels;

    error NotAvailable(string label, bytes32 parent);
    error Unauthorised();

    function addRegistrar(address r) external {
        registrars[r] = true;
    }

    function makeNode(bytes32 parentNode, string calldata label) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }

    function setAddr(bytes32 node, uint256 coinType, bytes calldata a) external {
        if (!registrars[msg.sender]) revert Unauthorised();
        addrs[node][coinType] = a;
    }

    function createSubnode(bytes32 node, string calldata label, address owner, bytes[] calldata)
        external
        returns (bytes32 sub)
    {
        if (!registrars[msg.sender]) revert Unauthorised();
        sub = makeNode(node, label);
        if (owners[uint256(sub)] != address(0)) revert NotAvailable(label, node);
        owners[uint256(sub)] = owner;
        labels[sub] = label;
        if (owner.code.length != 0) {
            // Same hand-off of control as OpenZeppelin _safeMint
            IERC721Receiver(owner).onERC721Received(msg.sender, address(0), uint256(sub), "");
        }
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return owners[tokenId];
    }
}
