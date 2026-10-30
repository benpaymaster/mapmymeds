#!/usr/bin/env bash
# Generates an UltraHonk proof for zkVerify (bb v3.0.x, Keccak transcript via the EVM target).
# Requires nargo 1.0.0-beta.15 and bb 3.0.x. zkVerify does not support bb >= 4.0.
set -euo pipefail
cd "$(dirname "$0")"
nargo execute
bb write_vk -b target/transfer_compliance.json -o target/proof -t evm
bb prove -b target/transfer_compliance.json -w target/transfer_compliance.gz \
  -k target/proof/vk -o target/proof -t evm
bb verify -k target/proof/vk -p target/proof/proof -i target/proof/public_inputs -t evm
echo "vk:            target/proof/vk  (1888 bytes expected)"
echo "proof:         target/proof/proof"
echo "public inputs: target/proof/public_inputs"
echo "Submit these to zkVerify (zkverifyjs or Kurier) with proofType ultrahonk, then read the aggregation receipt."
