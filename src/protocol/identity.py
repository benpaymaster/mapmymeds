# src/protocol/identity.py
from web3 import Web3
import os

# Base Mainnet RPC endpoint - This will be used to resolve ENS names
# In production, use a private node provider (like Alchemy or Infura)
RPC_URL = "https://mainnet.base.org" 

class PharmacyIdentity:
    def __init__(self, rpc_url: str = RPC_URL):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not self.w3.is_connected():
            raise ConnectionError("Failed to connect to the Base network.")

    def resolve_pharmacy(self, ens_name: str):
        """
        Resolves an ENS name (e.g., 'armley-pharmacy.eth') 
        to an Ethereum address.
        """
        try:
            # Standard ENS lookup
            address = self.w3.ens.resolve(ens_name)
            if address:
                return {"status": "success", "ens": ens_name, "address": address}
            return {"status": "error", "message": "ENS name not found"}
        except Exception as e:
            return {"status": "error", "message": f"Lookup failed: {str(e)}"}

# Example usage (for testing):
# identity = PharmacyIdentity()
# print(identity.resolve_pharmacy("example-pharmacy.eth"))