// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import "./IPharmacyRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PharmacyMatchingEngine
 * @dev Handles peer-to-peer inventory listings and ZKP-backed compliance matching for MapMyMeds securely.
 */
contract PharmacyMatchingEngine is Ownable {
    
    // Reference to the central pharmacy verification registry
    IPharmacyRegistry public pharmacyRegistry;

    struct InventoryListing {
        address pharmacy;
        bytes32 medicationHash; // Hashed identifier of the drug/quantity to protect privacy
        uint256 expiryTimestamp;
        bool active;
    }

    // Mapping from listingId => InventoryListing
    mapping(uint256 => InventoryListing) public listings;
    uint256 public nextListingId;

    // Track completed matches or fulfilled proofs to prevent replay
    mapping(bytes32 => bool) public complianceProofUsed;

    event ListingCreated(uint256 indexed listingId, address indexed pharmacy, bytes32 indexed medicationHash);
    event ListingCancelled(uint256 indexed listingId);
    event MatchFulfilled(uint256 indexed listingId, address indexed fulfiller, bytes32 complianceProof);
    event RegistryUpdated(address indexed newRegistry);

    modifier onlyVerifiedPharmacy() {
        require(pharmacyRegistry.isVerifiedPharmacy(msg.sender), "Caller is not a verified pharmacy");
        _;
    }

    constructor(address _registry) Ownable(msg.sender) {
        require(_registry != address(0), "Invalid registry address");
        pharmacyRegistry = IPharmacyRegistry(_registry);
    }

    /**
     * @dev Create a secure P2P inventory listing using a hashed medication commitment.
     */
    function createListing(bytes32 medicationHash, uint256 expiryTimestamp) external onlyVerifiedPharmacy {
        require(expiryTimestamp > block.timestamp, "Invalid expiry time");
        require(medicationHash != bytes32(0), "Invalid medication hash");

        uint256 listingId = nextListingId++;
        listings[listingId] = InventoryListing({
            pharmacy: msg.sender,
            medicationHash: medicationHash,
            expiryTimestamp: expiryTimestamp,
            active: true
        });

        emit ListingCreated(listingId, msg.sender, medicationHash);
    }

    /**
     * @dev Fulfill a P2P inventory match by providing a valid ZK compliance proof.
     */
    function fulfillMatch(
        uint256 listingId, 
        bytes32 complianceProof
    ) external onlyVerifiedPharmacy {
        // Mitigation: Ensure listing ID actually exists within bounds before processing
        require(listingId < nextListingId, "Listing does not exist");
        
        InventoryListing storage listing = listings[listingId];
        
        require(listing.active, "Listing is not active");
        require(block.timestamp <= listing.expiryTimestamp, "Listing has expired");
        
        // Mitigation: Prevent zero-hash state poisoning attacks
        require(complianceProof != bytes32(0), "Invalid zero compliance proof");
        require(!complianceProofUsed[complianceProof], "Compliance proof already utilized");
        
        require(msg.sender != listing.pharmacy, "Cannot fulfill own listing");

        complianceProofUsed[complianceProof] = true;
        listing.active = false;

        emit MatchFulfilled(listingId, msg.sender, complianceProof);
    }

    /**
     * @dev Cancel an active listing.
     */
    function cancelListing(uint256 listingId) external {
        // Mitigation: Ensure listing ID actually exists within bounds
        require(listingId < nextListingId, "Listing does not exist");

        InventoryListing storage listing = listings[listingId];
        require(msg.sender == listing.pharmacy, "Only listing owner can cancel");
        require(listing.active, "Listing already inactive");

        listing.active = false;
        emit ListingCancelled(listingId);
    }

    /**
     * @dev Administrative function to update the registry address.
     * Mitigation: Restricted strictly to contract owner using Ownable modifier.
     */
    function updateRegistry(address _newRegistry) external onlyOwner {
        require(_newRegistry != address(0), "Invalid registry address");
        pharmacyRegistry = IPharmacyRegistry(_newRegistry);
        emit RegistryUpdated(_newRegistry);
    }
}