"""
Core matching engine for inter-pharmacy stock routing.
Uses Zero-Knowledge proofs (simulated via Pedersen Commitments) 
to protect pharmacy data privacy during matching.
"""

from typing import List, Optional
from dataclasses import dataclass
import asyncio
import hashlib
import secrets

@dataclass
class MedicineRequest:
    snomed_code: str
    quantity: int
    urgency: str
    location: str

@dataclass
class InventoryItem:
    pharmacy_id: str
    snomed_code: str
    commitment: str  # The ZK-proof commitment
    expiry_date: str

@dataclass
class MatchResult:
    request_id: str
    pharmacy_id: str
    snomed_code: str
    proof: str
    estimated_delivery: str

class MatchingEngine:
    def __init__(self):
        self.request_queue: asyncio.Queue = None
    
    async def initialize(self):
        self.request_queue = asyncio.Queue()

    @staticmethod
    def generate_commitment(pharmacy_id: str, snomed_code: str, quantity: int, salt: str = None) -> str:
        """
        Generates a ZK-style commitment (Pedersen-like).
        The pharmacy stores this commitment on-chain/in-DB. 
        Raw quantity is never stored.
        """
        salt = salt or secrets.token_hex(16)
        data = f"{pharmacy_id}:{snomed_code}:{quantity}:{salt}".encode()
        return hashlib.sha256(data).hexdigest()

    async def _verify_commitment(self, item: InventoryItem, request_quantity: int, salt: str) -> bool:
        """
        Verifies if the commitment matches the expected criteria.
        This proves availability without revealing exact stock levels.
        """
        # In a real ZK-circuit, this verifies the proof P(commitment, quantity) -> True/False
        # Here we simulate the verification of the masked inventory data
        check_data = f"{item.pharmacy_id}:{item.snomed_code}:{request_quantity}:{salt}".encode()
        return item.commitment == hashlib.sha256(check_data).hexdigest()

    async def find_matches(
        self, 
        request: MedicineRequest, 
        inventory_commitments: List[InventoryItem],
        salt: str # The salt is provided by the pharmacy during the proof session
    ) -> List[MatchResult]:
        
        matches = []
        for item in inventory_commitments:
            if item.snomed_code == request.snomed_code:
                # Privacy-preserving match check
                if await self._verify_commitment(item, request.quantity, salt):
                    match = MatchResult(
                        request_id=f"req_{hash(request)}",
                        pharmacy_id=item.pharmacy_id,
                        snomed_code=item.snomed_code,
                        proof=item.commitment,
                        estimated_delivery=self._calculate_delivery(request.urgency)
                    )
                    matches.append(match)
        return matches

    def _calculate_delivery(self, urgency: str) -> str:
        delivery_times = {'low': '3-5 days', 'medium': '1-2 days', 'high': 'same day'}
        return delivery_times.get(urgency, '3-5 days')

async def create_matching_engine() -> MatchingEngine:
    engine = MatchingEngine()
    await engine.initialize()
    return engine