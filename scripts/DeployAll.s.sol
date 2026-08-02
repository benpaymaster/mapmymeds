// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {PharmacyInventory} from "../contracts/PharmacyInventory.sol";
import {PrescriptionNFT} from "../contracts/PrescriptionNFT.sol";

contract DeployAll is Script {
    function run() external {
        vm.startBroadcast();

        // Retrieve the deployed PharmacyRegistry address from environment variable or configure inline for pilot
        address registryAddress = vm.envOr("PHARMACY_REGISTRY_ADDRESS", address(0));
        require(registryAddress != address(0), "PHARMACY_REGISTRY_ADDRESS must be set");

        PharmacyInventory inventory = new PharmacyInventory(registryAddress);
        console.log("PharmacyInventory deployed to:", address(inventory));
        
        PrescriptionNFT nft = new PrescriptionNFT(registryAddress);
        console.log("PrescriptionNFT deployed to:", address(nft));

        vm.stopBroadcast();
    }
}