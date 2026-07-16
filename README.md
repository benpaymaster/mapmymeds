# MapMyMeds Protocol

![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-232F3E?logo=amazon-aws&logoColor=white)
![FHIR](https://img.shields.io/badge/FHIR-R4-009DC4?logo=hl7&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen)

# MapMyMeds Protocol

**Automated inter-pharmacy stock routing and financial settlement platform. Uses Zero-Knowledge proofs for privacy-preserving inventory discovery, FHIR R4 for data standards, and stateless Python architecture for scalable matching.**

## Vision

MapMyMeds Protocol enables pharmacies to automatically route stock between locations while maintaining complete privacy through Zero-Knowledge proofs. Our mission is to reduce medication waste, improve access, and optimize pharmacy logistics without exposing sensitive inventory data.

## Features

- **Privacy-First Matching**: ZK-proof powered inventory discovery protects pharmacy data
- **Customer-Facing Search**: "Google Maps for medication" - customers can find pharmacies with stock locally, nationally, or globally
- **Aggregated Stock Visibility**: Customers see stock status (in stock/low stock/expiring soon) without exposing exact quantities
- **FHIR R4 Compliance**: SNOMED CT codes for medicine identification, NHS Digital API governance
- **Automated Settlement**: Financial escrow and transaction logic for secure inter-pharmacy payments
- **Stateless Architecture**: Modular, testable Python components for scalability
- **Zero-Touch Integration**: Runs in background without disrupting existing PMR workflows

## Architecture

**API-First, Stateless Protocol**

- **Tech Stack**: Python (matching engine), AWS (infrastructure), FHIR R4 (data standards), REST APIs (PMR integration)
- **Privacy**: All inventory discovery and matching powered by Zero-Knowledge proofs
- **Standards**: SNOMED CT codes for medicine identification, NHS Digital API governance

## File Architecture

```
pharma-ai-web3/
├── src/
│   ├── matching_engine/    # Core matching logic (Python)
│   │   ├── __init__.py
│   │   ├── matcher.py      # ZK-proof powered B2B matching
│   │   └── customer_view.py # Customer-facing search with aggregated visibility
│   ├── api_integration/    # PMR API scripts (FHIR R4 compliant)
│   │   ├── __init__.py
│   │   ├── fhir_client.py  # FHIR R4 client for PMR integration
│   │   └── customer_api.py # Customer-facing REST API
│   └── settlement/         # Financial escrow and transaction logic
│       ├── __init__.py
│       └── escrow.py       # Secure fund holding and release
├── docs/
│   └── regulatory/         # Compliance frameworks and DPA templates
├── tests/                  # Unit and integration tests
├── archive/                # Archived old code (Solidity, React)
└── README.md
```

## How to Clone & Run

```bash
git clone https://github.com/benpaymaster/pharmafind.git
cd pharma-ai-web3
# Install dependencies
pip install -r requirements.txt
# Run customer-facing API
python -m src.api_integration.customer_api
# Access API at http://localhost:8001
```

## Privacy & Security

### Zero-Knowledge Proofs

- All inventory discovery uses ZK-proof commitments
- Raw pharmacy inventory data is never exposed
- Matching operations are stateless and privacy-preserving

### FHIR R4 Compliance

- SNOMED CT codes for all medicine identification
- NHS Digital API governance for integration scripts
- Zero-Touch integration with existing PMR workflows

### Financial Security

- Escrow-based settlement with proof-of-delivery verification
- Cryptographic proofs for all transactions
- Stateless transaction processing
