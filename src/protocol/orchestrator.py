# src/protocol/orchestrator.py
from src.protocol.identity import PharmacyIdentity
from src.protocol.inventory import InventoryManager
from src.protocol.settlement import SettlementEngine
from src.protocol.privacy import ZKPrivacyGuard

class ProtocolOrchestrator:
    """
    Unified controller to link Identity, Inventory, and Settlement 
    via ZK-proof verification.
    """
    def __init__(self):
        self.identity = PharmacyIdentity()
        self.inventory = InventoryManager()
        self.settlement = SettlementEngine()
        self.privacy = ZKPrivacyGuard()

    def process_secure_transfer(self, sender_ens: str, receiver_ens: str, med_id: str, proof: str):
        """
        The core protocol method: Validates a transfer request 
        only if the ZK-proof is verified.
        """
        # 1. Verify Sender Identity
        sender = self.identity.resolve_pharmacy(sender_ens)
        if sender['status'] != 'success':
            return {"error": "Invalid Sender Identity"}

        # 2. Verify ZK-Proof (The 'Lock' on the data)
        # We assume the sender provides the proof that they have stock
        if not self.privacy.verify_proof(sender_ens, True, proof):
            return {"error": "Invalid or Tampered Inventory Proof"}

        # 3. If passed, initiate settlement
        return self.settlement.initiate_transfer(sender_ens, receiver_ens, med_id)