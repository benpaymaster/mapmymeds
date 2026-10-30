import { BigInt } from "@graphprotocol/graph-ts";
import {
  PharmacyRegistered,
  PharmacyRevoked,
  FeePaid,
} from "../generated/PharmacyRegistry/PharmacyRegistry";
import { Pharmacy } from "../generated/schema";
import { loadStats } from "./stats";

export function handlePharmacyRegistered(event: PharmacyRegistered): void {
  let p = Pharmacy.load(event.params.pharmacy);
  if (p == null) {
    p = new Pharmacy(event.params.pharmacy);
    p.revoked = false;
    p.feePaidWei = BigInt.zero();
    p.registeredAt = event.block.timestamp;
    p.attestations = 0;
    let stats = loadStats();
    stats.pharmacies += 1;
    stats.save();
  }
  p.premisesCommitment = event.params.premisesCommitment;
  p.validUntil = event.params.validUntil;
  p.attestations += 1;
  p.save();
}

export function handlePharmacyRevoked(event: PharmacyRevoked): void {
  let p = Pharmacy.load(event.params.pharmacy);
  if (p == null) return;
  p.revoked = true;
  p.save();
}

export function handleFeePaid(event: FeePaid): void {
  // PharmacyRegistered is emitted first in the same transaction, so the entity exists.
  let p = Pharmacy.load(event.params.pharmacy);
  if (p == null) return;
  p.feePaidWei = p.feePaidWei.plus(event.params.amountWei);
  p.save();
  let stats = loadStats();
  stats.feesWei = stats.feesWei.plus(event.params.amountWei);
  stats.save();
}
