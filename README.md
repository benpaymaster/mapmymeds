# PharmaFind

![Solidity](https://img.shields.io/badge/Solidity-363636?logo=solidity&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen)

# PharmaFind

**A decentralized platform for real-time pharmacy inventory and expiry management. Uses Solidity smart contracts, distributed systems, and AI to help users locate medication, reduce waste, and optimize stock with a live map, expiry alerts, and secure, scalable backend.**

## Vision

PharmaFind is building the future of pharmacy logistics—where medication availability, expiry management, and transparency are powered by blockchain and AI. Our mission is to reduce waste, improve access, and empower both customers and pharmacy staff with real-time, trustworthy data.

## Features

- Live map of pharmacy locations and inventory
- Expiry notifications and automated stock recommendations
- Decentralized data model for trust and transparency
- Scalable backend API and AI-driven services
- Comprehensive test suite for reliability

## File Architecture

```
pharma-ai-web3/
├── ai/                  # Python FastAPI backend & AI services
│   ├── main.py
│   ├── requirements.txt
│   ├── models/
│   └── services/
├── contracts/           # Solidity smart contracts
│   ├── PharmacyInventory.sol
│   └── PrescriptionNFT.sol
├── frontend/            # React frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── PharmacyMap.jsx
│   │   │   └── ...
│   │   ├── data/
│   │   └── hooks/
│   ├── public/
│   └── ...
├── scripts/             # Deployment and interaction scripts
├── tests/               # Unit and integration tests
│   ├── ai/
│   ├── frontend/
│   └── smart_contracts/
└── README.md
```

## How to Clone & Run

```bash
git clone https://github.com/benpaymaster/pharmafind.git
cd pharma-ai-web3
# Backend (Python FastAPI)
cd ai
pip install -r requirements.txt
python main.py
# Frontend (React)
cd ../frontend
npm install
npm start
```

Access the frontend at http://localhost:3000 and backend API at http://localhost:8000.

## Smart Contract Security Analysis

### PharmacyInventory.sol

- Uses access control by associating inventory updates with msg.sender (pharmacy address).
- Emits events for stock changes and expiry alerts, supporting transparency and monitoring.
- Potential risks: No explicit access control for querying inventory; relies on public mapping. Consider adding role-based access for sensitive operations.
- Expiry alerts are based on block timestamps; ensure off-chain systems handle notifications securely.

### PrescriptionNFT.sol

- Uses OpenZeppelin's ERC721 and Ownable for secure NFT issuance and ownership management.
- Only contract owner can mint prescriptions, reducing unauthorized minting risk.
- Prescription data is linked to tokenId, with checks for token existence.
- Potential risks: Ensure only trusted parties are set as contract owner. Consider adding more granular access control for pharmacy operations.
- No direct transfer restrictions; if needed, implement transfer hooks to prevent unauthorized prescription transfers.

### General Recommendations

- Use OpenZeppelin libraries for standard security.
- Regularly audit contracts for reentrancy, overflow, and access control issues.
- Monitor and log all critical events for transparency.

---

# PharmaFind

**A decentralized platform for real-time pharmacy inventory and expiry management. Uses Solidity smart contracts, distributed systems, and AI to help users locate medication, reduce waste, and optimize stock with a live map, expiry alerts, and secure, scalable backend.**

## Vision

PharmaFind is building the future of pharmacy logistics—where medication availability, expiry management, and transparency are powered by blockchain and AI. Our mission is to reduce waste, improve access, and empower both customers and pharmacy staff with real-time, trustworthy data.
