import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from src.matching_engine.customer_view import CustomerSearchEngine
from src.protocol.orchestrator import ProtocolOrchestrator  # Added your new brain

app = FastAPI()

# Initialize your engines
engine = CustomerSearchEngine()
engine.seed_demo_data()

# The Orchestrator handles the secure logic
orchestrator = ProtocolOrchestrator()

@app.get("/api/search/{snomed_code}")
async def search_medication(snomed_code: str):
    return await engine.search_medication(snomed_code)

@app.post("/api/transfer")
async def initiate_transfer(sender: str, receiver: str, med_id: str, proof: str):
    """
    New Protocol Endpoint: Initiates a transfer using ZK-proof verification.
    """
    result = orchestrator.process_secure_transfer(sender, receiver, med_id, proof)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    print("--- MapMyMeds: Protocol MVP Active & Locked In ---")
    print("Engine: Privacy-Enabled (ZK-Proofs)")
    print("Orchestrator: Protocol Logic Online")
    uvicorn.run(app, host="0.0.0.0", port=8001)