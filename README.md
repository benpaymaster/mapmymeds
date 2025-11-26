# PharmaFind

**A decentralized platform for real-time pharmacy inventory and expiry management. Uses Solidity smart contracts, distributed systems, and AI to help users locate medication, reduce waste, and optimize stock with a live map, expiry alerts, and secure, scalable backend.**

## Vision

PharmaFind is building the future of pharmacy logistics—where medication availability, expiry management, and transparency are powered by blockchain and AI. Our mission is to reduce waste, improve access, and empower both customers and pharmacy staff with real-time, trustworthy data.

## What Makes PharmaFind Unique?

- **Decentralized Inventory & Expiry Management:** Smart contracts (`PharmacyInventory.sol`, `PrescriptionNFT.sol`) ensure secure, transparent, and scalable data for every pharmacy and medication.
- **AI-Driven Backend:** FastAPI and Python services deliver real-time location, expiry alerts, and automated recommendations.
- **Scalable Distributed Systems:** Designed for multi-branch, multi-stakeholder use, with robust performance and reliability.
- **Secure, Gas-Efficient Contracts:** Built with best practices for Solidity security and gas optimization.
- **Automated Testing:** Comprehensive unit and integration tests for smart contracts, backend, and frontend features.
- **Collaboration & Documentation:** Modular, well-documented codebase, ready for team growth and open innovation.

## Features

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

## How to Use

1. Clone the repository and install dependencies.
2. Start the backend API and frontend app.
3. Explore the live map, search for medication, and view expiry alerts.

## Startup Workflow

1. **Build New Features:** Smart contracts, backend APIs, and frontend components
2. **Test Features:** Unit and integration tests for all layers
3. **Push Changes:** Commit and push updates to GitHub
4. **Update README:** Document new features and architecture decisions

## Why PharmaFind?

PharmaFind is a showcase of senior-level Solidity, distributed systems, and AI integration skills—delivering a production-grade Dapp for real-world impact.

---

# PharmaFind

**A decentralized platform for real-time pharmacy inventory and expiry management. Uses Solidity smart contracts, distributed systems, and AI to help users locate medication, reduce waste, and optimize stock with a live map, expiry alerts, and secure, scalable backend.**

## Vision

PharmaFind is building the future of pharmacy logistics—where medication availability, expiry management, and transparency are powered by blockchain and AI. Our mission is to reduce waste, improve access, and empower both customers and pharmacy staff with real-time, trustworthy data.

## What Makes PharmaFind Unique?

- **Decentralized Inventory & Expiry Management:** Smart contracts (`PharmacyInventory.sol`, `PrescriptionNFT.sol`) ensure secure, transparent, and scalable data for every pharmacy and medication.
- **AI-Driven Backend:** FastAPI and Python services deliver real-time location, expiry alerts, and automated recommendations.
- **Scalable Distributed Systems:** Designed for multi-branch, multi-stakeholder use, with robust performance and reliability.
- **Secure, Gas-Efficient Contracts:** Built with best practices for Solidity security and gas optimization.
- **Automated Testing:** Comprehensive unit and integration tests for smart contracts, backend, and frontend features.
- **Collaboration & Documentation:** Modular, well-documented codebase, ready for team growth and open innovation.

## Senior Solidity Developer Skills Demonstrated

- Advanced smart contract design, optimization, and security
- Distributed system architecture for real-time, multi-branch data
- AI integration for automated decision support
- Full-stack engineering: frontend, backend, and blockchain
- Rigorous testing and documentation
- Secure coding and cryptographic principles

## Features

- Live map of pharmacy locations and inventory
- Expiry notifications and automated stock recommendations
- Decentralized data model for trust and transparency
- Scalable backend API and AI-driven services
- Comprehensive test suite for reliability

## How to Use

1. Clone the repository and install dependencies.
2. Start the backend API and frontend app.
3. Explore the live map, search for medication, and view expiry alerts.

## Why PharmaFind?

PharmaFind is a showcase of senior-level Solidity, distributed systems, and AI integration skills—delivering a production-grade Dapp for real-world impact.

---
