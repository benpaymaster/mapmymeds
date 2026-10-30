// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Base} from "./utils/Base.t.sol";
import {PharmacyMatchingEngine} from "../../contracts/PharmacyMatchingEngine.sol";
import {PharmacyInventory} from "../../contracts/PharmacyInventory.sol";
import {SettlementTicket} from "../../contracts/SettlementTicket.sol";
import {PharmacyNames} from "../../contracts/PharmacyNames.sol";
import {PharmacyRegistry} from "../../contracts/PharmacyRegistry.sol";
import {IPharmacyRegistry} from "../../contracts/interfaces/IPharmacyRegistry.sol";
import {ISettlementTicket} from "../../contracts/interfaces/ISettlementTicket.sol";
import {IComplianceVerifier} from "../../contracts/interfaces/IComplianceVerifier.sol";
import {IL2Registry} from "../../contracts/interfaces/IL2Registry.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Pause/unpause round trips, constructor guards and admin edge cases across all contracts.
contract AdminTest is Base {
    function test_engine_pauseRoundTrip() public {
        vm.startPrank(admin);
        engine.pause();
        engine.unpause();
        vm.stopPrank();
        _list(everest); // works again
    }

    function test_engine_confirmBlockedWhilePaused() public {
        uint256 id = _list(everest);
        _fulfil(id, alpha);
        vm.prank(admin);
        engine.pause();
        vm.prank(alpha);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        engine.confirmDelivery(id);
    }

    function test_inventory_pauseRoundTrip() public {
        vm.startPrank(admin);
        inventory.pause();
        inventory.unpause();
        vm.stopPrank();
        vm.prank(everest);
        inventory.updateSnapshot(keccak256("root"));
    }

    function test_registry_pauseRoundTrip() public {
        vm.startPrank(admin);
        registry.pause();
        registry.unpause();
        vm.stopPrank();
        _register(makeAddr("boots"));
    }

    function test_registry_domainSeparatorMatchesEip712() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("MapMyMeds PharmacyRegistry"),
                keccak256("1"),
                block.chainid,
                address(registry)
            )
        );
        assertEq(registry.domainSeparator(), expected);
    }

    function test_registry_revert_zeroPharmacy() public {
        PharmacyRegistry.Registration memory reg =
            _r(address(0), uint64(block.timestamp + 1 days), 0, block.timestamp + 1 hours);
        vm.expectRevert(PharmacyRegistry.ZeroAddress.selector);
        registry.register(reg, "");
    }

    function test_registry_revert_zeroAddressAdmin() public {
        vm.startPrank(admin);
        vm.expectRevert(PharmacyRegistry.ZeroAddress.selector);
        registry.setAttestor(address(0));
        vm.expectRevert(PharmacyRegistry.ZeroAddress.selector);
        registry.withdrawFees(payable(address(0)));
        vm.stopPrank();
    }

    function test_constructors_rejectZeroAddresses() public {
        IPharmacyRegistry reg = IPharmacyRegistry(address(registry));
        ISettlementTicket tkt = ISettlementTicket(address(ticket));
        IComplianceVerifier ver = IComplianceVerifier(address(verifier));

        vm.expectRevert(SettlementTicket.ZeroAddress.selector);
        new SettlementTicket(admin, IPharmacyRegistry(address(0)));

        vm.expectRevert(PharmacyInventory.ZeroAddress.selector);
        new PharmacyInventory(admin, IPharmacyRegistry(address(0)));

        vm.expectRevert(PharmacyMatchingEngine.ZeroAddress.selector);
        new PharmacyMatchingEngine(admin, IPharmacyRegistry(address(0)), tkt, ver);
        vm.expectRevert(PharmacyMatchingEngine.ZeroAddress.selector);
        new PharmacyMatchingEngine(admin, reg, ISettlementTicket(address(0)), ver);
        vm.expectRevert(PharmacyMatchingEngine.ZeroAddress.selector);
        new PharmacyMatchingEngine(admin, reg, tkt, IComplianceVerifier(address(0)));

        vm.expectRevert(PharmacyNames.ZeroAddress.selector);
        new PharmacyNames(IL2Registry(address(0)), address(registry));
        vm.expectRevert(PharmacyNames.ZeroAddress.selector);
        new PharmacyNames(IL2Registry(address(1)), address(0));
    }

    function test_ticket_revert_setEngineZero() public {
        SettlementTicket fresh = new SettlementTicket(admin, IPharmacyRegistry(address(registry)));
        vm.prank(admin);
        vm.expectRevert(SettlementTicket.ZeroAddress.selector);
        fresh.setEngine(address(0));
    }

    function test_names_revert_invalidLabelFromRegistry() public {
        PharmacyNames names = new PharmacyNames(IL2Registry(address(1)), address(this));
        vm.expectRevert(PharmacyNames.InvalidLabel.selector);
        names.issue("NOT-VALID", everest);
    }

    function test_inventory_verifyItem_unknownPharmacy() public view {
        assertFalse(inventory.verifyItem(outsider, keccak256("x"), 1, bytes32(0), new bytes32[](0)));
    }
}
