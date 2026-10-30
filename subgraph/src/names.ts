import { NameIssued } from "../generated/PharmacyNames/PharmacyNames";
import { Pharmacy } from "../generated/schema";

export function handleNameIssued(event: NameIssued): void {
  let p = Pharmacy.load(event.params.pharmacy);
  if (p == null) return;
  p.ensLabel = event.params.label;
  p.save();
}
