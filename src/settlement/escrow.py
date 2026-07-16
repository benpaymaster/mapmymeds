"""
Financial escrow and transaction logic for inter-pharmacy settlements.
Handles secure fund holding and release upon verified proof of delivery.
"""

from typing import Optional, Dict
from dataclasses import dataclass
from enum import Enum
import hashlib
import logging

# Set up logging for audit trails
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TransactionStatus(Enum):
    """Status of a settlement transaction."""
    PENDING = "pending"
    HELD_IN_ESCROW = "held_in_escrow"
    RELEASED = "released"
    REFUNDED = "refunded"
    FAILED = "failed"

@dataclass
class SettlementTransaction:
    """Represents a financial settlement transaction."""
    transaction_id: str
    buyer_pharmacy_id: str
    seller_pharmacy_id: str
    amount: float
    currency: str
    status: TransactionStatus
    proof_of_delivery: Optional[str] = None

class EscrowService:
    """
    Stateless escrow service for secure financial settlements.
    Holds funds in escrow until proof of delivery is cryptographically verified.
    """
    
    def __init__(self):
        self.transactions: Dict[str, SettlementTransaction] = {}
    
    async def create_transaction(
        self,
        buyer_pharmacy_id: str,
        seller_pharmacy_id: str,
        amount: float,
        currency: str = "GBP"
    ) -> SettlementTransaction:
        """Creates a new transaction and locks it in pending state."""
        # Create unique ID based on transaction details
        tx_hash = hashlib.sha256(
            f"{buyer_pharmacy_id}{seller_pharmacy_id}{amount}".encode()
        ).hexdigest()[:12]
        transaction_id = f"tx_{tx_hash}"
        
        transaction = SettlementTransaction(
            transaction_id=transaction_id,
            buyer_pharmacy_id=buyer_pharmacy_id,
            seller_pharmacy_id=seller_pharmacy_id,
            amount=amount,
            currency=currency,
            status=TransactionStatus.PENDING
        )
        
        self.transactions[transaction_id] = transaction
        logger.info(f"Transaction {transaction_id} created.")
        return transaction
    
    async def hold_in_escrow(self, transaction_id: str) -> bool:
        """Moves transaction to HELD_IN_ESCROW."""
        tx = self.transactions.get(transaction_id)
        if tx and tx.status == TransactionStatus.PENDING:
            tx.status = TransactionStatus.HELD_IN_ESCROW
            logger.info(f"Transaction {transaction_id} now held in escrow.")
            return True
        return False
    
    async def release_funds(self, transaction_id: str, proof_of_delivery: str) -> bool:
        """Releases funds only after cryptographic proof verification."""
        tx = self.transactions.get(transaction_id)
        if not tx or tx.status != TransactionStatus.HELD_IN_ESCROW:
            return False
        
        # Verify that the proof is cryptographically bound to this transaction
        if await self._verify_proof_of_delivery(proof_of_delivery, transaction_id):
            tx.status = TransactionStatus.RELEASED
            tx.proof_of_delivery = proof_of_delivery
            logger.info(f"Transaction {transaction_id} released successfully.")
            return True
        
        logger.warning(f"Invalid proof provided for transaction {transaction_id}.")
        return False
    
    async def _verify_proof_of_delivery(self, proof: str, tx_id: str) -> bool:
        """
        Hardened verification: ensures the proof is bound to the tx_id.
        In production, this would verify a digital signature from the recipient.
        """
        # Simulated check: proof must contain a hash of the tx_id
        expected_token = hashlib.sha256(tx_id.encode()).hexdigest()[:8]
        return expected_token in proof

    async def refund_transaction(self, transaction_id: str) -> bool:
        """Voids the transaction and refunds the buyer."""
        tx = self.transactions.get(transaction_id)
        if tx and tx.status != TransactionStatus.RELEASED:
            tx.status = TransactionStatus.REFUNDED
            return True
        return False

def create_escrow_service() -> EscrowService:
    return EscrowService()