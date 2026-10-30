// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../../script/Deploy.s.sol";
import {MockV3Aggregator} from "./utils/MockV3Aggregator.sol";
import {MockZkVerifyAggregation} from "./utils/MockZkVerifyAggregation.sol";
import {MockL2Registry} from "./utils/MockL2Registry.sol";

/// @notice Runs the real deploy script against mocks, so a broken script fails CI before it costs gas on Base.
contract DeployTest is Test {
    function test_deployWiresEverythingAndStartsHandover() public {
        vm.warp(1_790_000_000);
        Deploy script = new Deploy();
        address safe = makeAddr("safe");
        MockV3Aggregator seq = new MockV3Aggregator(0, 0);
        seq.set(0, block.timestamp - 2 hours, block.timestamp - 2 hours);

        Deploy.Config memory cfg = Deploy.Config({
            owner: safe,
            attestor: makeAddr("attestor"),
            zkVerify: address(new MockZkVerifyAggregation()),
            zkVerifyDomainId: 0,
            vkHash: keccak256("vk"),
            versionHash: sha256("ultrahonk:v3.0"),
            ethUsdFeed: address(new MockV3Aggregator(8, 3000e8)),
            gbpUsdFeed: address(new MockV3Aggregator(8, 1.27e8)),
            sequencerUptimeFeed: address(seq),
            ethUsdHeartbeat: 1200,
            gbpUsdHeartbeat: 86400,
            feePence: 2000,
            durinRegistry: address(new MockL2Registry())
        });

        Deploy.Deployment memory d = script.deploy(cfg, address(script));

        assertEq(d.ticket.engine(), address(d.engine));
        assertEq(address(d.engine.verifier()), address(d.verifier));
        assertEq(address(d.registry.feeQuoter()), address(d.quoter));
        assertEq(address(d.registry.names()), address(d.names));
        assertEq(d.registry.quoteRegistrationFee(), 8_466_666_666_666_667);

        // Two-step handover pending: deployer still owns until the Safe accepts.
        assertEq(d.registry.pendingOwner(), safe);
        assertEq(d.engine.pendingOwner(), safe);
        vm.prank(safe);
        d.registry.acceptOwnership();
        assertEq(d.registry.owner(), safe);
    }
}
