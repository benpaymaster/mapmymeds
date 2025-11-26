from fastapi import FastAPI
from fastapi.responses import JSONResponse
import json
import os

app = FastAPI()

@app.get("/pharmacies")
def get_pharmacies():
	# Path to the JSON data file
	data_path = os.path.join(os.path.dirname(__file__), '../frontend/src/data/cardiff_pharmacies.json')
	with open(data_path, 'r') as f:
		# Remove comments and load JSON
		raw = f.read()
		# Remove JS-style comments if present
		raw = '\n'.join([line for line in raw.splitlines() if not line.strip().startswith('//')])
		pharmacies = json.loads(raw)
	return JSONResponse(content=pharmacies)

if __name__ == "__main__":
	import uvicorn
	uvicorn.run(app, host="0.0.0.0", port=8000)
