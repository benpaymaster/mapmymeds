import os
from dotenv import load_dotenv
from web3 import Web3

# Load variables from .env
load_dotenv()

# Get the URL from the environment
RPC_URL = os.getenv("BASE_SEPOLIA_RPC_URL")
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Test the connection in Python
if w3.is_connected():
    print(f"Connected to Base: Block {w3.eth.block_number}")
else:
    print("Failed to connect.")