// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Script, console2} from "forge-std/Script.sol";
import {PharmacyRegistry} from "../contracts/PharmacyRegistry.sol";
import {SettlementTicket} from "../contracts/SettlementTicket.sol";
import {PharmacyMatchingEngine} from "../contracts/PharmacyMatchingEngine.sol";
import {PharmacyInventory} from "../contracts/PharmacyInventory.sol";
import {ZkVerifyComplianceVerifier} from "../contracts/ZkVerifyComplianceVerifier.sol";
import {GbpFeeQuoter} from "../contracts/GbpFeeQuoter.sol";
import {PharmacyNames} from "../contracts/PharmacyNames.sol";
import {IPharmacyRegistry} from "../contracts/interfaces/IPharmacyRegistry.sol";
import {ISettlementTicket} from "../contracts/interfaces/ISettlementTicket.sol";
import {IComplianceVerifier} from "../contracts/interfaces/IComplianceVerifier.sol";
import {IVerifyProofAggregation} from "../contracts/interfaces/IVerifyProofAggregation.sol";
import {IFeeQuoter} from "../contracts/interfaces/IFeeQuoter.sol";
import {IPharmacyNames} from "../contracts/interfaces/IPharmacyNames.sol";
import {IL2Registry} from "../contracts/interfaces/IL2Registry.sol";
import {AggregatorV3Interface} from "../contracts/interfaces/AggregatorV3Interface.sol";

/// @title Deploy
/// @notice Deploys and wires the full MapMyMeds system on Base or Base Sepolia.
/// @dev Usage (keys come from an encrypted Foundry keystore, never from a .env file):
///        cast wallet import deployer --interactive
///        source .env
///        forge script script/Deploy.s.sol --rpc-url base_sepolia --account deployer --broadcast --verify
///      The deployer owns everything during wiring, then starts a two-step ownership transfer to OWNER
///      (a Safe). The Safe must call `acceptOwnership()` on each contract to finish the hand-over.
///      If DURIN_REGISTRY is set, the Durin registry owner must also call `addRegistrar(names)`.
contract Deploy is Script {
    struct Config {
        address owner;
        address attestor;
        address zkVerify;
        uint256 zkVerifyDomainId;
        bytes32 vkHash;
        bytes32 versionHash;
        address ethUsdFeed;
        address gbpUsdFeed;
        address sequencerUptimeFeed;
        uint256 ethUsdHeartbeat;
        uint256 gbpUsdHeartbeat;
        uint256 feePence;
        address durinRegistry; // optional
    }

    struct Deployment {
        PharmacyRegistry registry;
        SettlementTicket ticket;
        ZkVerifyComplianceVerifier verifier;
        PharmacyMatchingEngine engine;
        PharmacyInventory inventory;
        GbpFeeQuoter quoter;
        PharmacyNames names;
    }

    function run() external returns (Deployment memory d) {
        Config memory cfg = Config({
            owner: vm.envAddress("OWNER"),
            attestor: vm.envAddress("ATTESTOR"),
            zkVerify: vm.envAddress("ZKVERIFY_AGGREGATION"),
            zkVerifyDomainId: vm.envOr("ZKVERIFY_DOMAIN_ID", uint256(0)),
            vkHash: vm.envBytes32("VK_HASH"),
            versionHash: vm.envOr("VERSION_HASH", sha256(abi.encodePacked("ultrahonk:v3.0"))),
            ethUsdFeed: vm.envAddress("ETH_USD_FEED"),
            gbpUsdFeed: vm.envAddress("GBP_USD_FEED"),
            sequencerUptimeFeed: vm.envOr("SEQUENCER_UPTIME_FEED", address(0)),
            ethUsdHeartbeat: vm.envOr("ETH_USD_HEARTBEAT", uint256(1200)),
            gbpUsdHeartbeat: vm.envOr("GBP_USD_HEARTBEAT", uint256(86400)),
            feePence: vm.envOr("REGISTRATION_FEE_PENCE", uint256(2000)),
            durinRegistry: vm.envOr("DURIN_REGISTRY", address(0))
        });

        vm.startBroadcast();
        d = deploy(cfg, msg.sender);
        vm.stopBroadcast();

        _log(d);
    }

    /// @notice Deploys and wires everything with `deployer` as temporary owner. Also used by DeployTest.
    function deploy(Config memory cfg, address deployer) public returns (Deployment memory d) {
        d.registry = new PharmacyRegistry(deployer, cfg.attestor);
        IPharmacyRegistry reg = IPharmacyRegistry(address(d.registry));

        d.ticket = new SettlementTicket(deployer, reg);
        d.verifier = new ZkVerifyComplianceVerifier(
            IVerifyProofAggregation(cfg.zkVerify), cfg.zkVerifyDomainId, cfg.vkHash, cfg.versionHash
        );
        d.engine = new PharmacyMatchingEngine(
            deployer, reg, ISettlementTicket(address(d.ticket)), IComplianceVerifier(address(d.verifier))
        );
        d.inventory = new PharmacyInventory(deployer, reg);
        d.quoter = new GbpFeeQuoter(
            AggregatorV3Interface(cfg.ethUsdFeed),
            AggregatorV3Interface(cfg.gbpUsdFeed),
            AggregatorV3Interface(cfg.sequencerUptimeFeed),
            cfg.ethUsdHeartbeat,
            cfg.gbpUsdHeartbeat
        );

        // Wiring
        d.ticket.setEngine(address(d.engine));
        d.registry.setFeeConfig(IFeeQuoter(address(d.quoter)), cfg.feePence);
        if (cfg.durinRegistry != address(0)) {
            d.names = new PharmacyNames(IL2Registry(cfg.durinRegistry), address(d.registry));
            d.registry.setNames(IPharmacyNames(address(d.names)));
        }

        // Hand over to the Safe (two-step: nothing changes until the Safe accepts)
        if (cfg.owner != deployer) {
            d.registry.transferOwnership(cfg.owner);
            d.ticket.transferOwnership(cfg.owner);
            d.engine.transferOwnership(cfg.owner);
            d.inventory.transferOwnership(cfg.owner);
        }
    }

    function _log(Deployment memory d) internal pure {
        console2.log("PharmacyRegistry          ", address(d.registry));
        console2.log("SettlementTicket          ", address(d.ticket));
        console2.log("ZkVerifyComplianceVerifier", address(d.verifier));
        console2.log("PharmacyMatchingEngine    ", address(d.engine));
        console2.log("PharmacyInventory         ", address(d.inventory));
        console2.log("GbpFeeQuoter              ", address(d.quoter));
        console2.log("PharmacyNames             ", address(d.names));
    }
}
