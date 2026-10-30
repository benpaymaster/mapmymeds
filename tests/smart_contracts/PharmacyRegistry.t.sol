// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Base} from "./utils/Base.t.sol";
import {PharmacyRegistry} from "../../contracts/PharmacyRegistry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract PharmacyRegistryTest is Base {
    address internal boots = makeAddr("boots");

    event PharmacyRegistered(address indexed pharmacy, bytes32 indexed premisesCommitment, uint64 validUntil);

    function _params() internal view returns (uint64 validUntil, uint256 deadline) {
        validUntil = uint64(block.timestamp + 90 days);
        deadline = block.timestamp + 1 hours;
    }

    // ------------------------------------------------------------------ happy path

    function test_register_setsRecordAndConsumesNonce() public {
        (uint64 validUntil, uint256 deadline) = _params();
        bytes memory sig = _sign(attestorKey, boots, validUntil, 0, deadline);

        vm.expectEmit(address(registry));
        emit PharmacyRegistered(boots, PREMISES, validUntil);
        vm.prank(outsider); // anyone may relay the signed registration
        registry.register(_r(boots, validUntil, 0, deadline), sig);

        assertTrue(registry.isVerifiedPharmacy(boots));
        assertEq(registry.nonces(boots), 1);
        (uint64 storedValidUntil, bool revoked, bytes32 commitment) = registry.pharmacies(boots);
        assertEq(storedValidUntil, validUntil);
        assertFalse(revoked);
        assertEq(commitment, PREMISES);
    }

    function test_reattestation_extendsValidity() public {
        uint64 extended = uint64(block.timestamp + 300 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(attestorKey, everest, extended, 1, deadline);
        registry.register(_r(everest, extended, 1, deadline), sig);
        (uint64 validUntil,,) = registry.pharmacies(everest);
        assertEq(validUntil, extended);
    }

    function test_verificationLapsesAtValidUntil() public {
        (uint64 validUntil,,) = registry.pharmacies(everest);
        vm.warp(validUntil);
        assertTrue(registry.isVerifiedPharmacy(everest));
        vm.warp(uint256(validUntil) + 1);
        assertFalse(registry.isVerifiedPharmacy(everest));
    }

    function test_unknownAddressIsNotVerified() public view {
        assertFalse(registry.isVerifiedPharmacy(outsider));
    }

    // ------------------------------------------------------------------ signature security

    function test_revert_signatureReplay() public {
        (uint64 validUntil, uint256 deadline) = _params();
        bytes memory sig = _sign(attestorKey, boots, validUntil, 0, deadline);
        registry.register(_r(boots, validUntil, 0, deadline), sig);

        vm.expectRevert(abi.encodeWithSelector(PharmacyRegistry.InvalidNonce.selector, 1, 0));
        registry.register(_r(boots, validUntil, 0, deadline), sig);
    }

    function test_revert_wrongSigner() public {
        (uint64 validUntil, uint256 deadline) = _params();
        uint256 imposterKey = 0xBAD;
        bytes memory sig = _sign(imposterKey, boots, validUntil, 0, deadline);
        vm.expectRevert(abi.encodeWithSelector(PharmacyRegistry.InvalidSigner.selector, vm.addr(imposterKey)));
        registry.register(_r(boots, validUntil, 0, deadline), sig);
    }

    function test_revert_signatureForDifferentPharmacy() public {
        (uint64 validUntil, uint256 deadline) = _params();
        bytes memory sig = _sign(attestorKey, boots, validUntil, 0, deadline);
        vm.expectRevert(); // recovers to an unrelated address
        registry.register(_r(outsider, validUntil, 0, deadline), sig);
    }

    function test_revert_tamperedValidity() public {
        (uint64 validUntil, uint256 deadline) = _params();
        bytes memory sig = _sign(attestorKey, boots, validUntil, 0, deadline);
        vm.expectRevert();
        registry.register(_r(boots, validUntil + 100 days, 0, deadline), sig);
    }

    function test_revert_crossContractReplay() public {
        PharmacyRegistry other = new PharmacyRegistry(admin, attestor);
        (uint64 validUntil, uint256 deadline) = _params();
        bytes memory sig = _sign(attestorKey, boots, validUntil, 0, deadline); // signed for `registry`
        vm.expectRevert(); // different verifyingContract in the EIP-712 domain
        other.register(_r(boots, validUntil, 0, deadline), sig);
    }

    function test_revert_crossChainReplay() public {
        (uint64 validUntil, uint256 deadline) = _params();
        bytes memory sig = _sign(attestorKey, boots, validUntil, 0, deadline);
        vm.chainId(84532); // Base Sepolia
        vm.expectRevert();
        registry.register(_r(boots, validUntil, 0, deadline), sig);
    }

    function test_revert_expiredDeadline() public {
        (uint64 validUntil, uint256 deadline) = _params();
        bytes memory sig = _sign(attestorKey, boots, validUntil, 0, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(PharmacyRegistry.SignatureExpired.selector, deadline));
        registry.register(_r(boots, validUntil, 0, deadline), sig);
    }

    function test_revert_malleableSignature() public {
        (uint64 validUntil, uint256 deadline) = _params();
        bytes32 digest = registry.registrationDigest(_r(boots, validUntil, 0, deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, digest);
        // Flip to the high-s twin: same signer, different bytes. OpenZeppelin ECDSA must reject it.
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 highS = bytes32(n - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        vm.expectRevert();
        registry.register(_r(boots, validUntil, 0, deadline), abi.encodePacked(r, highS, flippedV));
    }

    function testFuzz_revert_validityOutOfRange(uint64 validUntil) public {
        uint256 maxValid = block.timestamp + registry.MAX_VALIDITY();
        vm.assume(validUntil <= block.timestamp || validUntil > maxValid);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(attestorKey, boots, validUntil, 0, deadline);
        vm.expectRevert(abi.encodeWithSelector(PharmacyRegistry.InvalidValidity.selector, validUntil));
        registry.register(_r(boots, validUntil, 0, deadline), sig);
    }

    // ------------------------------------------------------------------ admin

    function test_revoke_isImmediateAndPermanent() public {
        vm.prank(admin);
        registry.revoke(everest);
        assertFalse(registry.isVerifiedPharmacy(everest));

        uint64 validUntil = uint64(block.timestamp + 90 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(attestorKey, everest, validUntil, 1, deadline);
        vm.expectRevert(abi.encodeWithSelector(PharmacyRegistry.PharmacyIsRevoked.selector, everest));
        registry.register(_r(everest, validUntil, 1, deadline), sig);
    }

    function test_revert_revokeUnknown() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PharmacyRegistry.NotRegistered.selector, outsider));
        registry.revoke(outsider);
    }

    function test_revert_nonOwnerAdmin() public {
        vm.startPrank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        registry.revoke(everest);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        registry.setAttestor(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        registry.pause();
        vm.stopPrank();
    }

    function test_attestorRotation_invalidatesOldKey() public {
        (uint64 validUntil, uint256 deadline) = _params();
        bytes memory oldSig = _sign(attestorKey, boots, validUntil, 0, deadline);

        uint256 newKey = 0x5EC0DE;
        vm.prank(admin);
        registry.setAttestor(vm.addr(newKey));

        vm.expectRevert(abi.encodeWithSelector(PharmacyRegistry.InvalidSigner.selector, attestor));
        registry.register(_r(boots, validUntil, 0, deadline), oldSig);

        registry.register(_r(boots, validUntil, 0, deadline), _sign(newKey, boots, validUntil, 0, deadline));
        assertTrue(registry.isVerifiedPharmacy(boots));
    }

    function test_pause_blocksRegistrationOnly() public {
        vm.prank(admin);
        registry.pause();
        assertTrue(registry.isVerifiedPharmacy(everest)); // existing verifications unaffected

        (uint64 validUntil, uint256 deadline) = _params();
        bytes memory sig = _sign(attestorKey, boots, validUntil, 0, deadline);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        registry.register(_r(boots, validUntil, 0, deadline), sig);
    }

    function test_ownershipTransferIsTwoStep() public {
        address safe = makeAddr("safe");
        vm.prank(admin);
        registry.transferOwnership(safe);
        assertEq(registry.owner(), admin); // nothing changes until accepted
        vm.prank(safe);
        registry.acceptOwnership();
        assertEq(registry.owner(), safe);
    }

    function test_revert_zeroAttestor() public {
        vm.expectRevert(PharmacyRegistry.ZeroAddress.selector);
        new PharmacyRegistry(admin, address(0));
    }
}
