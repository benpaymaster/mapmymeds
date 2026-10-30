// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IPharmacyRegistry} from "./interfaces/IPharmacyRegistry.sol";
import {IComplianceVerifier} from "./interfaces/IComplianceVerifier.sol";
import {ISettlementTicket} from "./interfaces/ISettlementTicket.sol";

/// @title PharmacyMatchingEngine
/// @author Adegbenga (Ben) Ogungbeje
/// @notice Peer-to-peer surplus stock matching between verified pharmacies, without revealing the medicine.
/// @dev Lifecycle of a listing:  Active -> Fulfilled -> Completed,  or  Active -> Cancelled.
///      - A supplier lists a salted commitment H(drugCode, schedule, quantity, salt); the medicine is never onchain.
///      - The supplier shares the opening privately with the matched pharmacy through the app.
///      - The receiving pharmacy fulfils by submitting a zero-knowledge proof that it knows the opening,
///        that the medicine is not a Schedule 1 or 2 controlled drug, and that the quantity it takes is valid.
///        The proof is bound to the caller's address, so a front-runner cannot steal it from the mempool.
///      - Fulfilment mints a SettlementTicket to the supplier; the recipient's delivery confirmation burns it.
contract PharmacyMatchingEngine is Ownable2Step, Pausable {
    enum Status {
        None,
        Active,
        Cancelled,
        Fulfilled,
        Completed
    }

    /// @dev Two storage slots: [supplier 20B | expiresAt 8B | status 1B] and [commitment 32B].
    ///      v1 used four slots (address, bytes32, uint256, bool).
    struct Listing {
        address supplier;
        uint64 expiresAt;
        Status status;
        bytes32 commitment;
    }

    /// @notice Longest a listing may stay open. Keeps stale surplus out of the market.
    uint64 public constant MAX_LISTING_DURATION = 30 days;

    IPharmacyRegistry public immutable registry;
    ISettlementTicket public immutable ticket;

    /// @notice Verifier for the transfer-compliance circuit. Replaceable when the circuit is upgraded.
    IComplianceVerifier public verifier;

    mapping(uint256 listingId => Listing) public listings;
    uint256 public nextListingId;

    /// @notice Nullifiers already consumed. Stops a valid proof being replayed.
    mapping(bytes32 nullifier => bool) public nullifierUsed;

    event ListingCreated(uint256 indexed listingId, address indexed supplier, bytes32 commitment, uint64 expiresAt);
    event ListingCancelled(uint256 indexed listingId);
    event MatchFulfilled(
        uint256 indexed listingId, address indexed supplier, address indexed recipient, bytes32 nullifier
    );
    event DeliveryConfirmed(uint256 indexed listingId, address indexed recipient);
    event VerifierUpdated(address indexed previousVerifier, address indexed newVerifier);

    error ZeroAddress();
    error ZeroValue();
    error NotVerifiedPharmacy(address account);
    error InvalidExpiry(uint64 expiresAt);
    error NotActive(uint256 listingId, Status status);
    error ListingExpired(uint256 listingId);
    error NotSupplier(uint256 listingId);
    error NotRecipient(uint256 listingId);
    error SelfFulfilment(uint256 listingId);
    error NullifierAlreadyUsed(bytes32 nullifier);
    error InvalidProof();

    modifier onlyVerified() {
        _checkVerified(msg.sender);
        _;
    }

    function _checkVerified(address account) internal view {
        if (!registry.isVerifiedPharmacy(account)) revert NotVerifiedPharmacy(account);
    }

    constructor(
        address initialOwner,
        IPharmacyRegistry registry_,
        ISettlementTicket ticket_,
        IComplianceVerifier verifier_
    ) Ownable(initialOwner) {
        if (address(registry_) == address(0) || address(ticket_) == address(0) || address(verifier_) == address(0)) {
            revert ZeroAddress();
        }
        registry = registry_;
        ticket = ticket_;
        verifier = verifier_;
        emit VerifierUpdated(address(0), address(verifier_));
    }

    // ---------------------------------------------------------------------
    // Supplier actions
    // ---------------------------------------------------------------------

    /// @notice Lists surplus stock as a hiding commitment.
    /// @param commitment Poseidon2(drugCode, schedule, quantity, salt) computed off-chain with the circuit's hash.
    /// @param expiresAt Timestamp after which the listing can no longer be fulfilled.
    /// @return listingId Identifier of the new listing (also the future ticket ID).
    function createListing(bytes32 commitment, uint64 expiresAt)
        external
        whenNotPaused
        onlyVerified
        returns (uint256 listingId)
    {
        if (commitment == bytes32(0)) revert ZeroValue();
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_LISTING_DURATION) {
            revert InvalidExpiry(expiresAt);
        }

        listingId = nextListingId++;
        listings[listingId] =
            Listing({supplier: msg.sender, expiresAt: expiresAt, status: Status.Active, commitment: commitment});

        emit ListingCreated(listingId, msg.sender, commitment, expiresAt);
    }

    /// @notice Withdraws an open listing. Deliberately allowed while paused so suppliers can always exit.
    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (listing.supplier != msg.sender) revert NotSupplier(listingId);
        if (listing.status != Status.Active) revert NotActive(listingId, listing.status);

        listing.status = Status.Cancelled;
        emit ListingCancelled(listingId);
    }

    // ---------------------------------------------------------------------
    // Recipient actions
    // ---------------------------------------------------------------------

    /// @notice Claims a listing with a zero-knowledge compliance proof.
    /// @param listingId Listing being claimed.
    /// @param nullifier Poseidon2(salt, recipient) output by the circuit; unique per claim.
    /// @param proof UltraHonk proof for public inputs [commitment, nullifier, msg.sender].
    function fulfillMatch(uint256 listingId, bytes32 nullifier, bytes calldata proof)
        external
        whenNotPaused
        onlyVerified
    {
        Listing storage listing = listings[listingId];
        address supplier = listing.supplier;

        // Checks
        if (listing.status != Status.Active) revert NotActive(listingId, listing.status);
        if (block.timestamp > listing.expiresAt) revert ListingExpired(listingId);
        if (supplier == msg.sender) revert SelfFulfilment(listingId);
        _checkVerified(supplier); // a supplier revoked after listing cannot be matched
        if (nullifierUsed[nullifier]) revert NullifierAlreadyUsed(nullifier);

        bytes32[] memory publicInputs = new bytes32[](3);
        publicInputs[0] = listing.commitment;
        publicInputs[1] = nullifier;
        publicInputs[2] = bytes32(uint256(uint160(msg.sender)));
        // `verify` is a view function, so this compiles to STATICCALL: the verifier cannot change state or re-enter.
        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        // Effects
        nullifierUsed[nullifier] = true;
        listing.status = Status.Fulfilled;

        emit MatchFulfilled(listingId, supplier, msg.sender, nullifier);

        // Interaction: trusted, immutable ticket contract, called last.
        ticket.mint(supplier, listingId, msg.sender);
    }

    /// @notice Recipient confirms the stock arrived. Closes the listing and burns the ticket.
    function confirmDelivery(uint256 listingId) external whenNotPaused {
        Listing storage listing = listings[listingId];
        if (listing.status != Status.Fulfilled) revert NotActive(listingId, listing.status);
        if (ticket.recipientOf(listingId) != msg.sender) revert NotRecipient(listingId);

        listing.status = Status.Completed;
        emit DeliveryConfirmed(listingId, msg.sender);

        ticket.burn(listingId);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice True if the listing can be fulfilled right now.
    function isOpen(uint256 listingId) external view returns (bool) {
        Listing storage listing = listings[listingId];
        return listing.status == Status.Active && block.timestamp <= listing.expiresAt;
    }

    // ---------------------------------------------------------------------
    // Admin (owner should be a Safe behind a TimelockController)
    // ---------------------------------------------------------------------

    /// @notice Points the engine at a new verifier after a circuit upgrade.
    function setVerifier(IComplianceVerifier newVerifier) external onlyOwner {
        if (address(newVerifier) == address(0)) revert ZeroAddress();
        emit VerifierUpdated(address(verifier), address(newVerifier));
        verifier = newVerifier;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
