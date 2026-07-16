import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from src.api_integration.customer_api import create_customer_api

# 1. Initialize your existing API
api = create_customer_api()
app = api.get_app()

# 2. Mount the static directory for your frontend
# html=True ensures that / loads index.html automatically
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    print("--- MapMyMeds: Protocol MVP Initiated ---")
    print("Frontend: http://0.0.0.0:8001/")
    print("API Documentation: http://0.0.0.0:8001/docs")
    
    uvicorn.run(app, host="0.0.0.0", port=8001)