# Applying the v2 contracts to your laptop

Do this on a new branch, so `main` is untouched until you've reviewed everything.

## 1. Make a branch and keep the old tests aside

```bash
cd ~/mapmymeds
git checkout -b v2-contracts
git mv tests/smart_contracts tests/smart_contracts_v1   # old tests target the old contracts
git rm contracts/PrescriptionNFT.sol contracts/IPharmacyRegistry.sol
```

`IPharmacyRegistry.sol` isn't gone; it moves to `contracts/interfaces/`.

## 2. Copy the new files in

Unzip `mapmymeds-v2.zip` (from your Downloads folder) over the repo:

```bash
unzip -o ~/Downloads/mapmymeds-v2.zip -d ~/mapmymeds
```

This replaces `contracts/`, `README.md`, `foundry.toml`, `.gitignore` and `subgraph/`, and adds `circuits/`, `script/`, `docs/`, `tests/smart_contracts/`, `.github/`, `.env.example`, `slither.config.json` and `.gas-snapshot`. Your `frontend/`, `backend/` and Python code are not touched.

## 3. Check the libraries

The contracts need OpenZeppelin **5.4.0** and forge-std:

```bash
grep '"version"' lib/openzeppelin-contracts/package.json
```

If it is not 5.4.0:

```bash
rm -rf lib/openzeppelin-contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0
forge install foundry-rs/forge-std      # if lib/forge-std is missing
```

If you have a `remappings.txt`, make sure it contains:

```
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
forge-std/=lib/forge-std/src/
```

## 4. Build and test

```bash
forge build
forge test
```

You should see **119 tests passed**. Then the circuit:

```bash
cd circuits/transfer_compliance && nargo test && cd ../..
```

## 5. Review, commit and push

```bash
git status            # check nothing unexpected changed
git diff --stat main
git add -A
git commit -m "feat: MapMyMeds v2 contracts (registry, ZK via zkVerify, Chainlink, ENS, subgraph, CI)"
git push -u origin v2-contracts
```

Open a pull request on GitHub from `v2-contracts` into `main`. CI will run the tests, Slither and the circuit tests on it. Merge when it's green.

## Optional: keep the full commit history

`mapmymeds-v2.bundle` holds the ten individual commits (baseline, rewrite, tests, ZK, Chainlink and ENS, deploy, subgraph, Slither fixes, docs). To browse them:

```bash
git clone ~/Downloads/mapmymeds-v2.bundle ~/mapmymeds-v2-history
cd ~/mapmymeds-v2-history && git log --stat
```

It's a useful walkthrough for interviews: each commit is one step of the story.
