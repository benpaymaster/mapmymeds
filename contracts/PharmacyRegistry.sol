// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IPharmacyRegistry} from "./interfaces/IPharmacyRegistry.sol";
import {IFeeQuoter} from "./interfaces/IFeeQuoter.sol";
import {IPharmacyNames} from "./interfaces/IPharmacyNames.sol";

/// @title PharmacyRegistry
/// @author Adegbenga (Ben) Ogungbeje
/// @notice Source of truth for which addresses are verified UK pharmacies on MapMyMeds.
/// @dev Onboarding flow:
///      1. A pharmacy applies off-chain. The MapMyMeds attestor checks it against the GPhC register and
///         approves an ENS label for it (e.g. "everest-bramley").
///      2. The attestor signs an EIP-712 `Registration` for the pharmacy's wallet.
///      3. Anyone (usually the pharmacy) submits it with `register`, paying the one-off registration fee in ETH,
///         priced in pounds through Chainlink. The pharmacy receives its ENS subname in the same transaction.
///      Signatures are bound to this contract and chain (EIP-712 domain), expire at `deadline`,
///      and are single-use through a per-pharmacy nonce. Verification itself expires at `validUntil`,
///      so a pharmacy must be re-attested periodically (re-attestation is free and issues no new name).
///      The owner (intended: a Safe multisig) can revoke a pharmacy immediately, rotate the attestor,
///      configure the fee and names modules, withdraw fees, and pause new registrations.
///      Only a salted commitment to the GPhC premises number is stored, never the number itself.
contract PharmacyRegistry is IPharmacyRegistry, Ownable2Step, Pausable, ReentrancyGuardTransient, EIP712 {
    /// @dev keccak256 of the EIP-712 struct type. Field order and types must match the off-chain signer exactly.
    bytes32 public constant REGISTRATION_TYPEHASH = keccak256(
        "Registration(address pharmacy,bytes32 premisesCommitment,string label,uint64 validUntil,uint256 nonce,uint256 deadline)"
    );

    /// @notice Upper bound on how long one attestation can keep a pharmacy verified.
    uint64 public constant MAX_VALIDITY = 365 days;

    /// @notice A registration approved off-chain by the attestor.
    struct Registration {
        address pharmacy;
        bytes32 premisesCommitment; // keccak256(GPhC premises number, salt)
        string label; // ENS label, e.g. "everest-bramley"; empty for no name
        uint64 validUntil;
        uint256 nonce;
        uint256 deadline;
    }

    /// @dev Slot 0: validUntil (8 bytes) + revoked (1 byte). Slot 1: premisesCommitment.
    struct Pharmacy {
        uint64 validUntil;
        bool revoked;
        bytes32 premisesCommitment;
    }

    /// @notice Address whose signatures are accepted as proof that a pharmacy passed off-chain checks.
    address public attestor;

    /// @notice Prices the registration fee in ETH. Zero address = no fee (e.g. testnet pilot).
    IFeeQuoter public feeQuoter;

    /// @notice One-off registration fee in pence (2000 = £20).
    uint256 public registrationFeePence;

    /// @notice ENS name issuer. Zero address = names disabled.
    IPharmacyNames public names;

    /// @notice Registration record per pharmacy wallet.
    /// @dev Written through a storage pointer in `register` and `revoke`.
    // slither-disable-next-line uninitialized-state
    mapping(address pharmacy => Pharmacy) public pharmacies;

    /// @notice Next expected nonce per pharmacy. Each successful registration consumes one.
    mapping(address pharmacy => uint256) public nonces;

    event AttestorUpdated(address indexed previousAttestor, address indexed newAttestor);
    event PharmacyRegistered(address indexed pharmacy, bytes32 indexed premisesCommitment, uint64 validUntil);
    event PharmacyRevoked(address indexed pharmacy);
    event FeePaid(address indexed pharmacy, address indexed payer, uint256 amountWei);
    event FeeConfigUpdated(address indexed feeQuoter, uint256 registrationFeePence);
    event NamesUpdated(address indexed names);
    event FeesWithdrawn(address indexed to, uint256 amountWei);

    error ZeroAddress();
    error SignatureExpired(uint256 deadline);
    error InvalidValidity(uint64 validUntil);
    error InvalidNonce(uint256 expected, uint256 provided);
    error InvalidSigner(address recovered);
    error PharmacyIsRevoked(address pharmacy);
    error NotRegistered(address pharmacy);
    error InsufficientFee(uint256 required, uint256 provided);

    /// @param initialOwner Admin account. Should be a multisig in production.
    /// @param initialAttestor Off-chain verification signer. Should be a separate, rotatable key.
    constructor(address initialOwner, address initialAttestor)
        Ownable(initialOwner)
        EIP712("MapMyMeds PharmacyRegistry", "1")
    {
        if (initialAttestor == address(0)) revert ZeroAddress();
        attestor = initialAttestor;
        emit AttestorUpdated(address(0), initialAttestor);
    }

    // ---------------------------------------------------------------------
    // Registration
    // ---------------------------------------------------------------------

    /// @notice Registers or re-attests a pharmacy using a signature from the attestor.
    /// @dev First registration charges the fee and issues the ENS name. Excess ETH is refunded to the caller.
    ///      Order: checks -> effects -> external calls (names module, refund), all under a reentrancy guard,
    ///      because Durin mints the name with `_safeMint`, which calls back into the pharmacy's wallet.
    /// @param reg The approved registration.
    /// @param signature 65-byte ECDSA signature by `attestor` over the EIP-712 digest of `reg`.
    function register(Registration calldata reg, bytes calldata signature) external payable whenNotPaused nonReentrant {
        address pharmacy = reg.pharmacy;
        if (pharmacy == address(0)) revert ZeroAddress();
        if (block.timestamp > reg.deadline) revert SignatureExpired(reg.deadline);
        if (reg.validUntil <= block.timestamp || reg.validUntil > block.timestamp + MAX_VALIDITY) {
            revert InvalidValidity(reg.validUntil);
        }

        uint256 expected = nonces[pharmacy];
        if (reg.nonce != expected) revert InvalidNonce(expected, reg.nonce);

        Pharmacy storage record = pharmacies[pharmacy];
        if (record.revoked) revert PharmacyIsRevoked(pharmacy);

        // ECDSA.recover rejects malleable (high-s) signatures and invalid ones.
        address signer = ECDSA.recover(_digest(reg), signature);
        if (signer != attestor) revert InvalidSigner(signer);

        bool firstRegistration = expected == 0;
        uint256 fee = firstRegistration ? _quoteFee() : 0;
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);

        // Effects
        unchecked {
            nonces[pharmacy] = expected + 1; // cannot realistically overflow a uint256
        }
        record.validUntil = reg.validUntil;
        record.premisesCommitment = reg.premisesCommitment;

        emit PharmacyRegistered(pharmacy, reg.premisesCommitment, reg.validUntil);
        if (fee != 0) emit FeePaid(pharmacy, msg.sender, fee);

        // Interactions
        if (firstRegistration && bytes(reg.label).length != 0 && address(names) != address(0)) {
            // slither-disable-next-line unused-return -- node is emitted by PharmacyNames
            names.issue(reg.label, pharmacy);
        }
        uint256 refund = msg.value - fee;
        if (refund != 0) Address.sendValue(payable(msg.sender), refund);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @inheritdoc IPharmacyRegistry
    function isVerifiedPharmacy(address pharmacy) external view returns (bool) {
        Pharmacy storage record = pharmacies[pharmacy];
        return !record.revoked && record.validUntil >= block.timestamp;
    }

    /// @notice Current registration fee in wei (0 when no fee is configured).
    function quoteRegistrationFee() external view returns (uint256) {
        return _quoteFee();
    }

    /// @notice EIP-712 digest the attestor must sign. Exposed so off-chain tooling and tests use one source of truth.
    function registrationDigest(Registration calldata reg) external view returns (bytes32) {
        return _digest(reg);
    }

    /// @notice Domain separator, for off-chain signers.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _digest(Registration calldata reg) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    REGISTRATION_TYPEHASH,
                    reg.pharmacy,
                    reg.premisesCommitment,
                    keccak256(bytes(reg.label)), // EIP-712 encodes dynamic strings as their hash
                    reg.validUntil,
                    reg.nonce,
                    reg.deadline
                )
            )
        );
    }

    function _quoteFee() internal view returns (uint256) {
        if (address(feeQuoter) == address(0) || registrationFeePence == 0) return 0;
        return feeQuoter.quoteWei(registrationFeePence);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Permanently blocks `pharmacy`. Takes effect immediately in every consuming contract.
    /// @dev Revocation is one-way by design: a struck-off pharmacy should register a fresh wallet after review.
    function revoke(address pharmacy) external onlyOwner {
        Pharmacy storage record = pharmacies[pharmacy];
        if (record.validUntil == 0) revert NotRegistered(pharmacy);
        record.revoked = true;
        emit PharmacyRevoked(pharmacy);
    }

    /// @notice Rotates the attestor key. Outstanding unsubmitted signatures from the old key become useless.
    function setAttestor(address newAttestor) external onlyOwner {
        if (newAttestor == address(0)) revert ZeroAddress();
        emit AttestorUpdated(attestor, newAttestor);
        attestor = newAttestor;
    }

    /// @notice Sets the Chainlink fee quoter and the fee in pence. Use (address(0), 0) to waive the fee.
    function setFeeConfig(IFeeQuoter quoter, uint256 feePence) external onlyOwner {
        feeQuoter = quoter;
        registrationFeePence = feePence;
        emit FeeConfigUpdated(address(quoter), feePence);
    }

    /// @notice Sets the ENS names module. Use address(0) to disable name issuance.
    function setNames(IPharmacyNames names_) external onlyOwner {
        names = names_;
        emit NamesUpdated(address(names_));
    }

    /// @notice Sends all collected fees to `to` (e.g. the company treasury Safe).
    function withdrawFees(address payable to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = address(this).balance;
        emit FeesWithdrawn(to, amount);
        Address.sendValue(to, amount);
    }

    /// @notice Stops new registrations. Existing verifications and revocations keep working.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
