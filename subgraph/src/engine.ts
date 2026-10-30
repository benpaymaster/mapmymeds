import {
  ListingCreated,
  ListingCancelled,
  MatchFulfilled,
  DeliveryConfirmed,
} from "../generated/PharmacyMatchingEngine/PharmacyMatchingEngine";
import { Listing } from "../generated/schema";
import { loadStats } from "./stats";

export function handleListingCreated(event: ListingCreated): void {
  let l = new Listing(event.params.listingId.toString());
  l.supplier = event.params.supplier;
  l.commitment = event.params.commitment;
  l.expiresAt = event.params.expiresAt;
  l.status = "Active";
  l.createdAt = event.block.timestamp;
  l.createdTx = event.transaction.hash;
  l.save();

  let stats = loadStats();
  stats.listings += 1;
  stats.save();
}

export function handleListingCancelled(event: ListingCancelled): void {
  let l = Listing.load(event.params.listingId.toString());
  if (l == null) return;
  l.status = "Cancelled";
  l.save();

  let stats = loadStats();
  stats.cancelled += 1;
  stats.save();
}

export function handleMatchFulfilled(event: MatchFulfilled): void {
  let l = Listing.load(event.params.listingId.toString());
  if (l == null) return;
  l.status = "Fulfilled";
  l.recipient = event.params.recipient;
  l.nullifier = event.params.nullifier;
  l.fulfilledAt = event.block.timestamp;
  l.save();

  let stats = loadStats();
  stats.fulfilled += 1;
  stats.save();
}

export function handleDeliveryConfirmed(event: DeliveryConfirmed): void {
  let l = Listing.load(event.params.listingId.toString());
  if (l == null) return;
  l.status = "Completed";
  l.completedAt = event.block.timestamp;
  l.save();

  let stats = loadStats();
  stats.completed += 1;
  stats.save();
}
