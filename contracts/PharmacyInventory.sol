// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPharmacyRegistry.sol";

contract PharmacyInventory is Ownable {
    // Mapping: Pharmacy Address => Medication Identifier (normalized) => ZK-Proof Hash
    mapping(address => mapping(string => bytes32)) public inventoryProofs;

    // Reference to the external pharmacy whitelist registry
    IPharmacyRegistry public pharmacyRegistry;

    event ProofUpdated(address indexed pharmacy, string medication, bytes32 proof);
    event RegistryUpdated(address indexed newRegistry);

    constructor(address _registry) Ownable(msg.sender) {
        require(_registry != address(0), "Invalid registry address");
        pharmacyRegistry = IPharmacyRegistry(_registry);
    }

    function updateStockProof(
        string memory _name,
        bytes32 _zkProof
    ) external {
        require(_zkProof != bytes32(0), "Invalid zero proof");
        
        bytes memory nameBytes = bytes(_name);
        require(nameBytes.length > 0, "Medication name cannot be empty");

        require(
            pharmacyRegistry.isVerifiedPharmacy(msg.sender), 
            "Caller is not a verified pharmacy"
        );

        inventoryProofs[msg.sender][_name] = _zkProof;
        emit ProofUpdated(msg.sender, _name, _zkProof);
    }

    function setPharmacyRegistry(address _newRegistry) external onlyOwner {
        require(_newRegistry != address(0), "Invalid registry address");
        pharmacyRegistry = IPharmacyRegistry(_newRegistry);
        emit RegistryUpdated(_newRegistry);
    }

    function getProof(
        address _pharmacy,
        string memory _name
    ) external view returns (bytes32) {
        return inventoryProofs[_pharmacy][_name];
    }
}