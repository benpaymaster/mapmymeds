# MapMyMeds smart contracts: security review

**Author:** Adegbenga (Ben) Ogungbeje
**Scope:** `contracts/` at the v2 rewrite (Solidity 0.8.33, OpenZeppelin 5.4.0)
**Method:** manual line-by-line review of v1, threat modelling, Slither 0.11.6, Foundry unit, fuzz and stateful invariant tests, and a Noir circuit test suite.

This is a self-review, not an independent audit. It records what I found in my own v1 code, how each issue was fixed, and the test that proves the fix. An external audit is planned before mainnet value is at stake.

---

## 1. Summary

| ID | Title | Severity | Status |
| --- | --- | --- | --- |
| H-01 | "ZK proofs" were never verified | High | Fixed |
| H-02 | Stock list and medicine names published onchain | High | Fixed |
| M-01 | Low-entropy hashes can be brute-forced | Medium | Fixed |
| M-02 | No real registry: verification logic was undefined | Medium | Fixed |
| M-03 | Single-key admin with one-step ownership transfer | Medium | Fixed |
| M-04 | Proofs not bound to the caller (front-running) | Medium | Fixed |
| L-01 | State updated after `_safeMint` external call | Low | Fixed |
| L-02 | Contracts not connected; lifecycle incomplete | Low | Fixed |
| L-03 | Misleading naming implied patient data ("PrescriptionNFT") | Low | Fixed |
| L-04 | Free-text medicine keys (case and whitespace variants) | Low | Fixed |
| L-05 | Revoked or expired pharmacies remained usable | Low | Fixed |
| G-01 | Struct used 4 storage slots; redundant mapping | Gas | Fixed |
| G-02 | `require` strings instead of custom errors | Gas | Fixed |
| I-01 | Floating pragma | Info | Fixed |
| I-02 | Events emitted after external calls | Info | Fixed |

**Outcome:** 119 Foundry tests (unit, fuzz at 1,000 runs, 4 invariants at 256 runs x 100 calls), 100% line and 98% branch coverage, 7 Noir circuit tests, Slither 0 findings, zero compiler or lint warnings.

---

## 2. Findings

### H-01: "ZK proofs" were never verified

**v1:** `PharmacyMatchingEngine.fulfillMatch`, `PharmacyInventory.updateStockProof` and `PrescriptionNFT.mint` accepted any non-zero `bytes32` labelled a "ZK proof". Nothing checked it. Any verified pharmacy could pass random bytes.

**Impact:** the core compliance guarantee did not exist. Calling it ZK was also a credibility risk.

**Fix:** a real Noir circuit (`circuits/transfer_compliance`) proves the transfer is allowed: the prover knows the listing's opening, the medicine is outside Controlled Drug Schedules 1 to 3, and the quantity requested is valid. Proofs are verified on zkVerify, and `ZkVerifyComplianceVerifier` checks zkVerify's aggregation receipt on Base for a statement of *this circuit's* verification key.

**Tests:** `ZkVerifyComplianceVerifier.t.sol` (end to end with the circuit's real public values, proof of a different circuit rejected, wrong aggregation or index rejected, any changed public input rejected by fuzzing); Noir tests `lying_about_the_drug_rejected`, `schedule_two_rejected`, `over_request_rejected`.

### H-02: Stock list and medicine names published onchain

**v1:** `PharmacyInventory` keyed storage by medicine name (`inventoryProofs[pharmacy]["atorvastatin"]`) and emitted the name in `ProofUpdated`. Anyone could reconstruct each pharmacy's stock list and timing.

**Impact:** breaks MapMyMeds' privacy promise and leaks commercially sensitive data.

**Fix:** one Merkle root per pharmacy. Leaves are `keccak256(keccak256(abi.encode(drugCode, stockBand, salt)))`, double-hashed against second-preimage attacks. Only the root goes onchain; the backend serves leaves and proofs, and anyone can check them with `verifyItem`.

**Tests:** `PharmacyInventory.t.sol` (correct item verifies, wrong band or missing salt fails, internal node cannot pose as a leaf).

### M-01: Low-entropy hashes can be brute-forced

**v1:** medication and prescription hashes had no salt. There are only a few hundred common medicines and quantities, so hashes can be reversed by hashing every combination.

**Fix:** every commitment includes a random salt: listings in the circuit's Pedersen commitment, inventory leaves, and the GPhC premises commitment in the registry.

### M-02: No real registry

**v1:** only `IPharmacyRegistry` existed. Every access check depended on a contract that had not been written.

**Fix:** `PharmacyRegistry`. Pharmacies are onboarded with an EIP-712 signature from an attestor who has checked the GPhC register off-chain. Signatures carry a per-pharmacy nonce, a deadline, and are bound to the chain and contract. Verification expires (`validUntil`, maximum 365 days) and can be revoked permanently. OpenZeppelin `ECDSA.recover` rejects malleable signatures.

**Tests:** `PharmacyRegistry.t.sol` covers replay, wrong signer, tampered fields, cross-contract replay, cross-chain replay, expired deadline, high-s malleable signature, validity bounds (fuzzed), revocation, attestor rotation and pause behaviour.

### M-03: Single-key admin with one-step ownership transfer

**v1:** `Ownable` in every contract. One key could redirect the registry (deciding who is "verified") and mint tickets, and a typo in `transferOwnership` would lose control permanently.

**Fix:** `Ownable2Step` everywhere; the deploy script hands ownership to a Safe multisig, which must accept. Admin surface reduced: the registry address is `immutable` in consumers, the ticket's engine is set once, and the owner cannot mint tickets. `Pausable` stops new activity while letting suppliers cancel listings.

### M-04: Proofs not bound to the caller

**Risk in a naive fix:** a valid proof seen in the mempool could be copied by another verified pharmacy and submitted first.

**Fix:** the recipient's address is a public input to the circuit and to the zkVerify statement, and the nullifier is `pedersen(salt, recipient)`. A copied proof fails for anyone else.

**Tests:** `test_revert_fulfil_frontRunWithStolenProof`, `test_revert_stolenReceipt`, Noir `proof_bound_to_recipient`.

### L-01: State updated after `_safeMint`

**v1:** `PrescriptionNFT.mint` called `_safeMint` (which calls the recipient) before `nextTokenId++`, breaking checks-effects-interactions.

**Fix:** `SettlementTicket` writes state first and uses `_mint`, so no control is handed over. Where a callback is unavoidable (Durin's ENS mint), `PharmacyRegistry.register` uses a transient-storage reentrancy guard.

**Tests:** `test_reentrancyFromNameCallbackIsBlocked` attacks through the ERC-721 receive hook.

### L-02: Contracts not connected; lifecycle incomplete

**v1:** matching did not mint anything, the owner minted manually, and tickets never completed.

**Fix:** `fulfillMatch` mints the ticket (token ID equals listing ID, so double issuance is impossible), and `confirmDelivery` by the recipient burns it. Statuses: Active, Cancelled, Fulfilled, Completed.

**Tests:** invariants `invariant_ticketsMatchStatus` and `invariant_accounting`.

### L-03: Misleading naming

`PrescriptionNFT` held no prescription, but the name suggested patient health data onchain, a red flag for NHS information governance. Renamed `SettlementTicket`; it stores only the listing ID and recipient wallet.

### L-04: Free-text medicine keys

"Atorvastatin", "atorvastatin" and "atorvastatin " were different keys. v2 uses fixed `bytes32` NHS dm+d codes.

### L-05: Revoked or expired pharmacies remained usable

v1 inventory entries stayed readable after revocation. In v2, `verifyItem` fails for revoked pharmacies and for snapshots older than 2 days, a revoked supplier's open listings cannot be fulfilled, and tickets cannot be transferred to unverified wallets.

### G-01 and G-02: Gas

The listing struct now packs into 2 slots instead of 4 (verified by reading raw storage in `test_listingUsesTwoStorageSlots`), the redundant `fulfillingPharmacy` mapping is gone, and custom errors replace revert strings.

| Operation | v1 gas | v2 gas | Change |
| --- | --- | --- | --- |
| `createListing` | 142,462 | 99,316 | -30% |
| Match plus settlement ticket | 233,685 | 149,655 | -36% (now including proof verification) |
| Ticket transfer | 70,091 | 61,132 | -13% |

Inventory leaf hashing is written in Yul (`leafFor`), and a fuzz test proves it matches the Solidity expression for every input.

### I-01 and I-02

The pragma is pinned to `0.8.33`. Events are emitted before external calls (Slither `reentrancy-events`).

---

## 3. New components added in v2

| Component | Main risks considered | Mitigations | Tests |
| --- | --- | --- | --- |
| `GbpFeeQuoter` (Chainlink) | Stale prices, sequencer outage on Base, zero or negative answers, decimals mismatch, rounding | Heartbeat checks per feed, L2 Sequencer Uptime Feed with 1-hour grace period, `answer > 0`, `updatedAt` sanity, 18-decimal normalisation, round up | `GbpFeeQuoter.t.sol`, including a fuzz proof of never undercharging by more than 1 wei |
| Registration fee | Underpayment, stuck overpayment, reentrancy through refund | Fee checked before effects, excess refunded last under a reentrancy guard, fee only on first registration | `RegistrationFeeAndNames.t.sol` |
| `PharmacyNames` (ENS via Durin) | Name squatting, impersonation, homoglyphs | Label signed by the attestor, only the registry can issue, ASCII `a-z0-9-` rule, name collisions revert | `test_revert_tamperedLabel`, `test_labelRules`, fuzzed character check |
| `ZkVerifyComplianceVerifier` | Accepting proofs of another circuit or version, malformed receipts | Fixed `vkHash` and `versionHash`, index bounds, view-only STATICCALL path | `ZkVerifyComplianceVerifier.t.sol` |

## 4. Trust assumptions

- **Attestor key:** can approve new pharmacies (not revoke). It should be a dedicated key, separate from the owner, rotated with `setAttestor`.
- **Owner (Safe):** can revoke pharmacies, pause, change the verifier and fee settings, and withdraw fees. Production should place a `TimelockController` between the Safe and the verifier and fee settings.
- **zkVerify:** the adapter trusts zkVerify's aggregation roots as posted on Base.
- **Chainlink:** trusted for ETH/USD, GBP/USD and sequencer status.
- **Off-chain matching:** suppliers share the salt privately with the matched pharmacy through the app.

## 5. Known limitations

- The Controlled Drug rule in the circuit is a simplified model for the pilot; full UK requirements (Schedule 4/5 record keeping, wholesale thresholds) are handled off-chain.
- zkVerify and Chainlink addresses, plus the Durin registry, are deployment settings; confirm them against the official docs before each deployment.
- The UltraHonk proof must be generated with bb 3.0.x (zkVerify does not accept 4.0+).
- No independent audit yet.

## 6. Slither triage

Slither 0.11.6 reports 0 findings with `slither.config.json`. Excluded detectors and individually annotated lines:

| Detector | Location | Verdict |
| --- | --- | --- |
| `timestamp` | Expiry, staleness and validity checks | Intended. Minutes-scale manipulation by a sequencer is irrelevant for windows of hours to months. |
| `assembly` | `PharmacyInventory.leafFor` | Intended, memory-safe, fuzz-tested against Solidity. |
| `cyclomatic-complexity` | `PharmacyRegistry.register` | Accepted: a linear sequence of checks with full test coverage. |
| `uninitialized-state` | `PharmacyRegistry.pharmacies` | False positive: written through a storage pointer. |
| `incorrect-equality` | `snap.root == 0` | Intended sentinel for "never published". |
| `unused-return` | Chainlink `latestRoundData`, ENS `createSubnode` | Intended: deprecated fields and an already-known node. |
