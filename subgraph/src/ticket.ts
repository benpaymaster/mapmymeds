import { Address } from "@graphprotocol/graph-ts";
import { Transfer } from "../generated/SettlementTicket/SettlementTicket";
import { Listing } from "../generated/schema";

// Ticket ID == listing ID. Tracks who currently holds the dispatch obligation (e.g. a branch it was handed to).
export function handleTicketTransfer(event: Transfer): void {
  let l = Listing.load(event.params.tokenId.toString());
  if (l == null) return;
  if (event.params.to.equals(Address.zero())) {
    l.ticketHolder = null; // burned on delivery confirmation
  } else {
    l.ticketHolder = event.params.to;
  }
  l.save();
}
