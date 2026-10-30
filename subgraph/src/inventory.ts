import { SnapshotUpdated } from "../generated/PharmacyInventory/PharmacyInventory";
import { Pharmacy, Snapshot } from "../generated/schema";

export function handleSnapshotUpdated(event: SnapshotUpdated): void {
  let s = new Snapshot(event.transaction.hash.concatI32(event.logIndex.toI32()));
  s.pharmacy = event.params.pharmacy;
  s.root = event.params.root;
  s.updatedAt = event.params.updatedAt;
  s.save();

  let p = Pharmacy.load(event.params.pharmacy);
  if (p == null) return;
  p.latestSnapshot = s.id;
  p.save();
}
