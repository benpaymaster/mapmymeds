import { BigInt } from "@graphprotocol/graph-ts";
import { ProtocolStats } from "../generated/schema";

export function loadStats(): ProtocolStats {
  let stats = ProtocolStats.load("global");
  if (stats == null) {
    stats = new ProtocolStats("global");
    stats.pharmacies = 0;
    stats.listings = 0;
    stats.fulfilled = 0;
    stats.completed = 0;
    stats.cancelled = 0;
    stats.feesWei = BigInt.zero();
  }
  return stats;
}
