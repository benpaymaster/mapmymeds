// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Base} from "./utils/Base.t.sol";
import {SettlementTicket} from "../../contracts/SettlementTicket.sol";
import {IPharmacyRegistry} from "../../contracts/interfaces/IPharmacyRegistry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SettlementTicketTest is Base {
    function test_revert_mint_notEngine() public {
        vm.prank(admin); // even the owner cannot mint
        vm.expectRevert(abi.encodeWithSelector(SettlementTicket.NotEngine.selector, admin));
        ticket.mint(everest, 0, alpha);
    }

    function test_revert_burn_notEngine() public {
        uint256 id = _list(everest);
        _fulfil(id, alpha);
        vm.prank(everest); // the holder cannot burn and skip delivery confirmation
        vm.expectRevert(abi.encodeWithSelector(SettlementTicket.NotEngine.selector, everest));
        ticket.burn(id);
    }

    function test_revert_setEngine_twice() public {
        vm.prank(admin);
        vm.expectRevert(SettlementTicket.EngineAlreadySet.selector);
        ticket.setEngine(outsider);
    }

    function test_revert_setEngine_notOwner() public {
        SettlementTicket fresh = new SettlementTicket(admin, IPharmacyRegistry(address(registry)));
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        fresh.setEngine(outsider);
    }

    function test_transfer_toVerifiedBranch() public {
        address branch = makeAddr("everest-branch");
        _register(branch);
        uint256 id = _list(everest);
        _fulfil(id, alpha);

        vm.prank(everest);
        ticket.transferFrom(everest, branch, id);
        assertEq(ticket.ownerOf(id), branch);
        assertEq(ticket.recipientOf(id), alpha); // who receives the stock does not change
    }

    function test_revert_transfer_toUnverified() public {
        uint256 id = _list(everest);
        _fulfil(id, alpha);
        vm.prank(everest);
        vm.expectRevert(abi.encodeWithSelector(SettlementTicket.NotVerifiedPharmacy.selector, outsider));
        ticket.transferFrom(everest, outsider, id);
    }

    function test_revert_transfer_toRevokedPharmacy() public {
        uint256 id = _list(everest);
        _fulfil(id, alpha);
        vm.prank(admin);
        registry.revoke(alpha);
        vm.prank(everest);
        vm.expectRevert(abi.encodeWithSelector(SettlementTicket.NotVerifiedPharmacy.selector, alpha));
        ticket.transferFrom(everest, alpha, id);
    }

    function test_metadata() public view {
        assertEq(ticket.name(), "MapMyMeds Settlement Ticket");
        assertEq(ticket.symbol(), "MMM-ST");
    }
}
