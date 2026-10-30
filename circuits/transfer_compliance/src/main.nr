// MapMyMeds transfer-compliance circuit.
//
// Proves, without revealing the medicine, that a pharmacy-to-pharmacy stock transfer is allowed:
//   1. The prover knows the opening of the listing's commitment:
//        commitment = pedersen(drug_code, schedule, quantity, salt)
//   2. The medicine is not in Controlled Drug Schedules 1-3, which need written requisitions
//      and cannot use this peer-to-peer flow. Encoding: 1-5 = CD schedule, 6 = not controlled.
//   3. The quantity requested is positive and no more than the quantity listed.
//   4. The nullifier is derived from the listing's secret salt and the recipient's address:
//        nullifier = pedersen(salt, recipient)
//      so the same claim can never be replayed, and the proof is bound to one recipient wallet.
//
// Public inputs, in order: commitment, nullifier, recipient.
// These match PharmacyMatchingEngine.fulfillMatch and the zkVerify statement built by
// ZkVerifyComplianceVerifier.
//
// Simplified model for the pilot: real UK rules also cover Schedule 4/5 record keeping and
// wholesale-dealing thresholds, which stay off-chain in the app.

global MIN_ALLOWED_SCHEDULE: u8 = 4;
global NOT_CONTROLLED: u8 = 6;

fn commit(drug_code: Field, schedule: u8, quantity: u32, salt: Field) -> Field {
    std::hash::pedersen_hash([drug_code, schedule as Field, quantity as Field, salt])
}

fn nullify(salt: Field, recipient: Field) -> Field {
    std::hash::pedersen_hash([salt, recipient])
}

fn main(
    drug_code: Field,
    schedule: u8,
    quantity: u32,
    salt: Field,
    requested: u32,
    commitment: pub Field,
    nullifier: pub Field,
    recipient: pub Field,
) {
    assert(commit(drug_code, schedule, quantity, salt) == commitment, "commitment mismatch");
    assert(schedule >= MIN_ALLOWED_SCHEDULE, "controlled drug: requisition required");
    assert(schedule <= NOT_CONTROLLED, "invalid schedule");
    assert(requested > 0, "nothing requested");
    assert(requested <= quantity, "requested exceeds listed quantity");
    assert(nullify(salt, recipient) == nullifier, "nullifier mismatch");
}

// ------------------------------------------------------------------ tests

global ATORVASTATIN: Field = 320000000; // illustrative dm+d code
global SALT: Field = 0x1f2e3d4c5b6a79880011223344556677;
global ALPHA: Field = 0x84bfba8f12eb09a3963b62c55ad2893343e93ecc; // recipient wallet as a field

#[test]
fn valid_transfer() {
    let c = commit(ATORVASTATIN, NOT_CONTROLLED, 100, SALT);
    main(ATORVASTATIN, NOT_CONTROLLED, 100, SALT, 40, c, nullify(SALT, ALPHA), ALPHA);
}

#[test]
fn schedule_four_allowed() {
    let c = commit(ATORVASTATIN, 4, 10, SALT);
    main(ATORVASTATIN, 4, 10, SALT, 10, c, nullify(SALT, ALPHA), ALPHA);
}

#[test(should_fail_with = "controlled drug: requisition required")]
fn schedule_two_rejected() {
    let c = commit(ATORVASTATIN, 2, 100, SALT);
    main(ATORVASTATIN, 2, 100, SALT, 1, c, nullify(SALT, ALPHA), ALPHA);
}

#[test(should_fail_with = "requested exceeds listed quantity")]
fn over_request_rejected() {
    let c = commit(ATORVASTATIN, NOT_CONTROLLED, 100, SALT);
    main(ATORVASTATIN, NOT_CONTROLLED, 100, SALT, 101, c, nullify(SALT, ALPHA), ALPHA);
}

#[test(should_fail_with = "commitment mismatch")]
fn lying_about_the_drug_rejected() {
    // Supplier listed a Schedule 2 drug; prover claims it is uncontrolled.
    let c = commit(ATORVASTATIN, 2, 100, SALT);
    main(ATORVASTATIN, NOT_CONTROLLED, 100, SALT, 1, c, nullify(SALT, ALPHA), ALPHA);
}

#[test(should_fail_with = "nullifier mismatch")]
fn proof_bound_to_recipient() {
    let c = commit(ATORVASTATIN, NOT_CONTROLLED, 100, SALT);
    let thief: Field = 0xdead;
    main(ATORVASTATIN, NOT_CONTROLLED, 100, SALT, 1, c, nullify(SALT, ALPHA), thief);
}

#[test(should_fail_with = "nothing requested")]
fn zero_request_rejected() {
    let c = commit(ATORVASTATIN, NOT_CONTROLLED, 100, SALT);
    main(ATORVASTATIN, NOT_CONTROLLED, 100, SALT, 0, c, nullify(SALT, ALPHA), ALPHA);
}

/// Prints the public values used in Prover.toml. Run: nargo test print_example_inputs --show-output
#[test]
fn print_example_inputs() {
    println(commit(ATORVASTATIN, NOT_CONTROLLED, 100, SALT));
    println(nullify(SALT, ALPHA));
}
