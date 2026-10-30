// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Base} from "./utils/Base.t.sol";
import {PharmacyRegistry} from "../../contracts/PharmacyRegistry.sol";
import {PharmacyNames} from "../../contracts/PharmacyNames.sol";
import {GbpFeeQuoter} from "../../contracts/GbpFeeQuoter.sol";
import {IFeeQuoter} from "../../contracts/interfaces/IFeeQuoter.sol";
import {IPharmacyNames} from "../../contracts/interfaces/IPharmacyNames.sol";
import {IL2Registry} from "../../contracts/interfaces/IL2Registry.sol";
import {AggregatorV3Interface} from "../../contracts/interfaces/AggregatorV3Interface.sol";
import {MockV3Aggregator} from "./utils/MockV3Aggregator.sol";
import {MockL2Registry} from "./utils/MockL2Registry.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice A pharmacy wallet that tries to re-enter registration from the ENS mint callback.
contract ReentrantPharmacy is IERC721Receiver {
    PharmacyRegistry internal registry;
    PharmacyRegistry.Registration internal reg;
    bytes internal sig;

    constructor(PharmacyRegistry registry_) {
        registry = registry_;
    }

    function arm(PharmacyRegistry.Registration calldata reg_, bytes calldata sig_) external {
        reg = reg_;
        sig = sig_;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        registry.register(reg, sig); // must be blocked
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}

contract RegistrationFeeAndNamesTest is Base {
    MockV3Aggregator internal ethUsd;
    MockV3Aggregator internal gbpUsd;
    MockV3Aggregator internal sequencer;
    GbpFeeQuoter internal quoter;
    MockL2Registry internal ens;
    PharmacyNames internal names;

    address internal boots = makeAddr("boots");
    address internal payer = makeAddr("payer");
    uint256 internal constant FEE_WEI = 8_466_666_666_666_667; // £20 at $3,000/ETH and $1.27/£

    function setUp() public override {
        super.setUp();
        ethUsd = new MockV3Aggregator(8, 3000e8);
        gbpUsd = new MockV3Aggregator(8, 1.27e8);
        sequencer = new MockV3Aggregator(0, 0);
        sequencer.set(0, block.timestamp - 2 hours, block.timestamp - 2 hours);
        quoter = new GbpFeeQuoter(
            AggregatorV3Interface(address(ethUsd)),
            AggregatorV3Interface(address(gbpUsd)),
            AggregatorV3Interface(address(sequencer)),
            20 minutes,
            1 days
        );
        ens = new MockL2Registry();
        names = new PharmacyNames(IL2Registry(address(ens)), address(registry));
        ens.addRegistrar(address(names));

        vm.startPrank(admin);
        registry.setFeeConfig(IFeeQuoter(address(quoter)), 2000);
        registry.setNames(IPharmacyNames(address(names)));
        vm.stopPrank();
        vm.deal(payer, 1 ether);
    }

    function _reg(address pharmacy, string memory label, uint256 nonce)
        internal
        view
        returns (PharmacyRegistry.Registration memory reg, bytes memory sig)
    {
        reg = _r(pharmacy, uint64(block.timestamp + 180 days), nonce, block.timestamp + 1 hours);
        reg.label = label;
        sig = _signReg(attestorKey, reg);
    }

    // ------------------------------------------------------------------ fee

    function test_quoteRegistrationFee() public view {
        assertEq(registry.quoteRegistrationFee(), FEE_WEI);
    }

    function test_firstRegistration_chargesFeeAndRefundsExcess() public {
        (PharmacyRegistry.Registration memory reg, bytes memory sig) = _reg(boots, "boots-leeds", 0);
        vm.prank(payer);
        registry.register{value: 0.01 ether}(reg, sig);

        assertEq(address(registry).balance, FEE_WEI);
        assertEq(payer.balance, 1 ether - FEE_WEI);
        assertTrue(registry.isVerifiedPharmacy(boots));
    }

    function test_revert_insufficientFee() public {
        (PharmacyRegistry.Registration memory reg, bytes memory sig) = _reg(boots, "boots-leeds", 0);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PharmacyRegistry.InsufficientFee.selector, FEE_WEI, FEE_WEI - 1));
        registry.register{value: FEE_WEI - 1}(reg, sig);
    }

    function test_reattestationIsFreeAndRefunded() public {
        (PharmacyRegistry.Registration memory reg, bytes memory sig) = _reg(everest, "", 1); // already registered
        vm.prank(payer);
        registry.register{value: 0.01 ether}(reg, sig);
        assertEq(address(registry).balance, 0);
        assertEq(payer.balance, 1 ether);
    }

    function test_revert_registrationBlockedWhileSequencerDown() public {
        sequencer.set(1, block.timestamp, block.timestamp);
        (PharmacyRegistry.Registration memory reg, bytes memory sig) = _reg(boots, "boots-leeds", 0);
        vm.prank(payer);
        vm.expectRevert(GbpFeeQuoter.SequencerDown.selector);
        registry.register{value: 0.01 ether}(reg, sig);
    }

    function test_withdrawFees_onlyOwner() public {
        (PharmacyRegistry.Registration memory reg, bytes memory sig) = _reg(boots, "boots-leeds", 0);
        vm.prank(payer);
        registry.register{value: FEE_WEI}(reg, sig);

        address treasury = makeAddr("treasury");
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        registry.withdrawFees(payable(treasury));

        vm.prank(admin);
        registry.withdrawFees(payable(treasury));
        assertEq(treasury.balance, FEE_WEI);
        assertEq(address(registry).balance, 0);
    }

    function test_feeCanBeWaived() public {
        vm.prank(admin);
        registry.setFeeConfig(IFeeQuoter(address(0)), 0);
        (PharmacyRegistry.Registration memory reg, bytes memory sig) = _reg(boots, "boots-leeds", 0);
        registry.register(reg, sig);
        assertTrue(registry.isVerifiedPharmacy(boots));
    }

    // ------------------------------------------------------------------ ENS names

    function test_firstRegistration_issuesEnsName() public {
        (PharmacyRegistry.Registration memory reg, bytes memory sig) = _reg(boots, "boots-leeds", 0);
        vm.prank(payer);
        registry.register{value: FEE_WEI}(reg, sig);

        bytes32 node = ens.makeNode(ens.baseNode(), "boots-leeds");
        assertEq(ens.ownerOf(uint256(node)), boots);
        assertEq(ens.addrs(node, 60), abi.encodePacked(boots));
        assertEq(ens.addrs(node, names.coinType()), abi.encodePacked(boots));
        assertEq(names.labelOf(boots), "boots-leeds");
    }

    function test_revert_tamperedLabel() public {
        (PharmacyRegistry.Registration memory reg, bytes memory sig) = _reg(boots, "boots-leeds", 0);
        reg.label = "nhs-official"; // the attestor approved a different name
        vm.prank(payer);
        vm.expectRevert(); // recovers a different signer
        registry.register{value: FEE_WEI}(reg, sig);
    }

    function test_revert_nameAlreadyTaken() public {
        (PharmacyRegistry.Registration memory reg, bytes memory sig) = _reg(boots, "boots-leeds", 0);
        vm.prank(payer);
        registry.register{value: FEE_WEI}(reg, sig);

        address copycat = makeAddr("copycat");
        (reg, sig) = _reg(copycat, "boots-leeds", 0);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MockL2Registry.NotAvailable.selector, "boots-leeds", ens.baseNode()));
        registry.register{value: FEE_WEI}(reg, sig);
    }

    function test_revert_issueNotFromRegistry() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PharmacyNames.NotPharmacyRegistry.selector, outsider));
        names.issue("free-name", outsider);
    }

    function test_labelRules() public view {
        assertTrue(names.isValidLabel("everest-bramley"));
        assertTrue(names.isValidLabel("abc"));
        assertTrue(names.isValidLabel("pharmacy24"));
        assertFalse(names.isValidLabel("ab")); // too short
        assertFalse(names.isValidLabel("-everest"));
        assertFalse(names.isValidLabel("everest-"));
        assertFalse(names.isValidLabel("Everest")); // uppercase is not ENS-normalised
        assertFalse(names.isValidLabel("ever est"));
        assertFalse(names.isValidLabel("b\xd0\xbeots")); // Cyrillic 'o' homoglyph
    }

    function testFuzz_labelOnlyAllowsSafeCharacters(string calldata label) public view {
        bytes memory b = bytes(label);
        if (names.isValidLabel(label)) {
            for (uint256 i; i < b.length; ++i) {
                bytes1 c = b[i];
                assertTrue((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-");
            }
        }
    }

    function test_reentrancyFromNameCallbackIsBlocked() public {
        ReentrantPharmacy attacker = new ReentrantPharmacy(registry);
        (PharmacyRegistry.Registration memory reg, bytes memory sig) = _reg(address(attacker), "attacker", 0);
        (PharmacyRegistry.Registration memory reg2, bytes memory sig2) = _reg(address(attacker), "", 1);
        attacker.arm(reg2, sig2);

        vm.prank(payer);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        registry.register{value: FEE_WEI}(reg, sig);
    }
}
