// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {IL2Registry} from "./interfaces/IL2Registry.sol";
import {IPharmacyNames} from "./interfaces/IPharmacyNames.sol";

/// @title PharmacyNames
/// @author Adegbenga (Ben) Ogungbeje
/// @notice Durin registrar that gives every verified pharmacy a human-readable ENS name on Base,
///         such as `everest-bramley.mapmymeds.eth`, so patients and pharmacists see names instead of hex addresses.
/// @dev Only the PharmacyRegistry can issue names, and the label is part of the attestor's EIP-712 signature,
///      so nobody can squat names like "boots" or impersonate another pharmacy.
///      After deployment, the Durin registry owner must call `addRegistrar(address(this))`.
contract PharmacyNames is IPharmacyNames {
    /// @notice ENSIP-11: EVM chain coin types are 0x80000000 | chainId.
    uint256 public constant ENSIP11_EVM_FLAG = 0x8000_0000;

    IL2Registry public immutable ens;
    address public immutable pharmacyRegistry;
    /// @notice ENSIP-11 coin type for this chain, so wallets resolve the name to the Base address.
    uint256 public immutable coinType;

    /// @notice Label issued to each pharmacy, for the frontend and subgraph.
    mapping(address pharmacy => string) public labelOf;

    event NameIssued(address indexed pharmacy, bytes32 indexed node, string label);

    error ZeroAddress();
    error NotPharmacyRegistry(address caller);
    error InvalidLabel();

    constructor(IL2Registry ens_, address pharmacyRegistry_) {
        if (address(ens_) == address(0) || pharmacyRegistry_ == address(0)) revert ZeroAddress();
        ens = ens_;
        pharmacyRegistry = pharmacyRegistry_;
        coinType = ENSIP11_EVM_FLAG | block.chainid;
    }

    /// @inheritdoc IPharmacyNames
    function issue(string calldata label, address pharmacy) external returns (bytes32 node) {
        if (msg.sender != pharmacyRegistry) revert NotPharmacyRegistry(msg.sender);
        if (!isValidLabel(label)) revert InvalidLabel();

        bytes32 base = ens.baseNode();
        node = ens.makeNode(base, label);
        bytes memory addr = abi.encodePacked(pharmacy);

        labelOf[pharmacy] = label;
        emit NameIssued(pharmacy, node, label);

        ens.setAddr(node, coinType, addr); // Base address, needed for reverse resolution
        ens.setAddr(node, 60, addr); // mainnet coin type, for wallets that only read ETH addresses
        // slither-disable-next-line unused-return -- the node is already known
        ens.createSubnode(base, label, pharmacy, new bytes[](0)); // reverts if the name is taken
    }

    /// @notice 3-63 characters of lowercase a-z, 0-9 and inner hyphens. Keeps names ENS-normalised and avoids
    ///         look-alike Unicode (homoglyph) impersonation.
    function isValidLabel(string calldata label) public pure returns (bool) {
        bytes calldata b = bytes(label);
        uint256 len = b.length;
        if (len < 3 || len > 63) return false;
        if (b[0] == "-" || b[len - 1] == "-") return false;
        for (uint256 i; i < len; ++i) {
            bytes1 c = b[i];
            bool ok = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-";
            if (!ok) return false;
        }
        return true;
    }
}
