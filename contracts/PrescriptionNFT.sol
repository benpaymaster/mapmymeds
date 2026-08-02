// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPharmacyRegistry.sol";

/**
 * @title PrescriptionNFT
 * @dev Acts as a settlement/escrow ticket for MedMap protocol transactions with secure transfer safeguards.
 */
contract PrescriptionNFT is ERC721, Ownable {
    uint256 public nextTokenId;
    
    // Reference to the pharmacy verification registry
    IPharmacyRegistry public pharmacyRegistry;

    // Store a ZK-commitment hash instead of the raw drug data
    mapping(uint256 => bytes32) public prescriptionHash; 
    
    // Prevent double-minting of the same prescription proof
    mapping(bytes32 => bool) public hashUsed;

    // Track which pharmacy address is officially associated with fulfilling this order
    mapping(uint256 => address) public fulfillingPharmacy;

    event PrescriptionMinted(uint256 indexed tokenId, address indexed recipient, bytes32 indexed prescriptionHash);
    event PharmacyDelegated(uint256 indexed tokenId, address indexed oldPharmacy, address indexed newPharmacy);
    event RegistryUpdated(address indexed newRegistry);

    constructor(address _registry) ERC721("PrescriptionNFT", "PRX") Ownable(msg.sender) {
        require(_registry != address(0), "Invalid registry address");
        pharmacyRegistry = IPharmacyRegistry(_registry);
    }

    /**
     * @dev Mint a new prescription NFT to a verified pharmacy.
     * @param to The recipient address (must be a verified pharmacy).
     * @param _prescriptionHash The ZK-proof hash confirming the match validity.
     */
    function mint(
        address to,
        bytes32 _prescriptionHash
    ) external onlyOwner {
        // 1. Prevent duplicate/replay minting for the same prescription hash
        require(!hashUsed[_prescriptionHash], "Prescription NFT already minted");
        
        // 2. Ensure recipient is a verified pharmacy
        require(pharmacyRegistry.isVerifiedPharmacy(to), "Recipient is not a verified pharmacy");
        
        require(_prescriptionHash != bytes32(0), "Invalid zero hash");

        uint256 tokenId = nextTokenId;
        
        hashUsed[_prescriptionHash] = true;
        prescriptionHash[tokenId] = _prescriptionHash;
        fulfillingPharmacy[tokenId] = to;

        _safeMint(to, tokenId);
        nextTokenId++;

        emit PrescriptionMinted(tokenId, to, _prescriptionHash);
    }

    /**
     * @dev Hook that updates the fulfilling pharmacy mapping if the NFT is transferred or delegated,
     * ensuring the new holder is also a verified pharmacy.
     */
    function _update(
        address to, 
        uint256 tokenId, 
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // If this is a transfer (not minting or burning)
        if (from != address(0) && to != address(0)) {
            // Ensure the receiving pharmacy is verified before delegation/transfer succeeds
            require(pharmacyRegistry.isVerifiedPharmacy(to), "Transfer target is not a verified pharmacy");
            
            // Update internal tracking mapping to match the new fulfilling pharmacy
            fulfillingPharmacy[tokenId] = to;
            emit PharmacyDelegated(tokenId, from, to);
        }

        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Administrative function to update the registry address if needed.
     */
    function setPharmacyRegistry(address _newRegistry) external onlyOwner {
        require(_newRegistry != address(0), "Invalid registry address");
        pharmacyRegistry = IPharmacyRegistry(_newRegistry);
        emit RegistryUpdated(_newRegistry);
    }

    function verifyPrescription(
        uint256 tokenId, 
        bytes32 _providedHash
    ) external view returns (bool) {
        return prescriptionHash[tokenId] == _providedHash;
    }
}