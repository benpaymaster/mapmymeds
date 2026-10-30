// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IPharmacyRegistry} from "./interfaces/IPharmacyRegistry.sol";

/// @title PharmacyInventory
/// @author Adegbenga (Ben) Ogungbeje
/// @notice Tamper-evident, privacy-preserving stock snapshots for verified pharmacies.
/// @dev v1 stored `inventoryProofs[pharmacy]["atorvastatin"]` and emitted the medicine name in events,
///      which published every pharmacy's stock list. v2 stores one 32-byte Merkle root per pharmacy:
///        leaf = keccak256(bytes.concat(keccak256(abi.encode(drugCode, stockBand, salt))))
///      - drugCode: NHS dm+d code (bytes32), not a free-text name, so there are no spelling variants.
///      - stockBand: 0 = out, 1 = low, 2 = medium, 3 = high. Exact quantities stay private, as the product requires.
///      - salt: random per leaf, so leaves cannot be guessed by hashing every drug and band.
///      - Double hashing follows OpenZeppelin's guidance and prevents second-preimage attacks on the tree.
///      The MapMyMeds backend serves leaves and proofs to users; this contract lets anyone check that what the
///      backend shows matches what the pharmacy committed to, and how fresh it is.
contract PharmacyInventory is Ownable2Step, Pausable {
    struct Snapshot {
        bytes32 root;
        uint64 updatedAt;
    }

    /// @notice Snapshots older than this are treated as stale and fail verification.
    uint64 public constant MAX_STALENESS = 2 days;

    IPharmacyRegistry public immutable registry;

    mapping(address pharmacy => Snapshot) public snapshots;

    event SnapshotUpdated(address indexed pharmacy, bytes32 root, uint64 updatedAt);

    error ZeroAddress();
    error ZeroValue();
    error NotVerifiedPharmacy(address account);

    constructor(address initialOwner, IPharmacyRegistry registry_) Ownable(initialOwner) {
        if (address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
    }

    /// @notice Publishes the caller's latest stock snapshot. A pharmacy can only ever write its own entry.
    function updateSnapshot(bytes32 root) external whenNotPaused {
        if (root == bytes32(0)) revert ZeroValue();
        if (!registry.isVerifiedPharmacy(msg.sender)) revert NotVerifiedPharmacy(msg.sender);

        uint64 nowTs = uint64(block.timestamp);
        snapshots[msg.sender] = Snapshot({root: root, updatedAt: nowTs});
        emit SnapshotUpdated(msg.sender, root, nowTs);
    }

    /// @notice Builds the leaf exactly as the off-chain tree builder must:
    ///         keccak256(bytes.concat(keccak256(abi.encode(drugCode, stockBand, salt))))
    /// @dev Hand-written Yul avoids the intermediate `bytes` allocations Solidity makes for `abi.encode`
    ///      and `bytes.concat`. It writes only to scratch space at the free-memory pointer and does not move it,
    ///      so it is memory-safe. Equivalence with the Solidity expression is fuzz-tested.
    function leafFor(bytes32 drugCode, uint8 stockBand, bytes32 salt) public pure returns (bytes32 leaf) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, drugCode)
            mstore(add(ptr, 0x20), and(stockBand, 0xff))
            mstore(add(ptr, 0x40), salt)
            mstore(0x00, keccak256(ptr, 0x60)) // inner hash into scratch space
            leaf := keccak256(0x00, 0x20)
        }
    }

    /// @notice True if `pharmacy` is still verified, its snapshot is fresh, and the item is in that snapshot.
    function verifyItem(address pharmacy, bytes32 drugCode, uint8 stockBand, bytes32 salt, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        Snapshot memory snap = snapshots[pharmacy];
        // slither-disable-next-line incorrect-equality -- zero root is the "never published" sentinel
        if (snap.root == bytes32(0)) return false;
        if (block.timestamp > snap.updatedAt + MAX_STALENESS) return false;
        if (!registry.isVerifiedPharmacy(pharmacy)) return false;
        return MerkleProof.verifyCalldata(proof, snap.root, leafFor(drugCode, stockBand, salt));
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
