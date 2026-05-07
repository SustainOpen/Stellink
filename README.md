# PayBeam

> Shareable payment links for **Stellar**. One-time, recurring, or escrow-protected — XLM and USDC.

PayBeam lets anyone with a Stellar wallet generate a sharable payment link in seconds. The link can be sent over email, embedded on a website, or shared on social media. The recipient opens the link, connects [Freighter](https://www.freighter.app/), and pays — no app download, no account creation.

| Property | Value |
|---|---|
| **Network**         | Stellar Testnet (mainnet via env switch)              |
| **Wallet**          | Freighter (multi-wallet on the [roadmap](./ROADMAP.md)) |
| **Frontend**        | React 18 · Vite · Tailwind                            |
| **Smart contract**  | Soroban (Rust)                                        |
| **Storage**         | [PocketBase](https://pocketbase.io) (single binary, embedded SQLite) — with localStorage fallback |
| **License**         | MIT                                                   |

---

## Repository layout

```
paybeam/
├── frontend/          # Vite + React app — the entire user surface
│   ├── src/
│   │   ├── components/    # CreateLink, LinkDetail, Dashboard, Header, ...
│   │   ├── hooks/         # useStellarWallet (Freighter)
│   │   ├── lib/           # types, stellar tx builders, linkStore, pocketbase client
│   │   └── pages/
│   ├── public/            # logo, static assets
│   └── package.json
│
├── contracts/         # Soroban escrow registry (Rust)
│   ├── Cargo.toml
│   └── paybeam-escrow/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs     # PaybeamEscrow contract
│           └── test.rs    # cargo test suite
│
├── scripts/
│   ├── pocketbase-setup.sh        # one-shot bootstrap — downloads + starts + applies schema
│   └── pocketbase-schema.json     # canonical collection definition
│
├── docker-compose.yml             # PocketBase via Docker (alternative to native binary)
├── README.md                      # you are here
├── CONTRIBUTING.md                # how to help
├── ROADMAP.md                     # what's next
└── LICENSE                        # MIT
```

There is intentionally **no backend folder**. The frontend talks directly to:

- **Freighter** for signing.
- **Horizon** (Stellar's public REST API) for transaction submission and history.
- **PocketBase** for cross-device link persistence — and falls back to localStorage when no PocketBase URL is configured.

This keeps the trust surface tiny and the deployment story simple. See [ARCHITECTURE.md](#architecture) below for the rationale.

---

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Freighter wallet](https://www.freighter.app/) browser extension (set to **Test Net**)
- (Optional) [Docker](https://www.docker.com/) — for the PocketBase service
- (Optional) [Rust](https://rustup.rs) + [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup) — for contract work

### 1. Install

```bash
git clone https://github.com/<your-org>/paybeam.git
cd paybeam
npm install
```

### 2. Start PocketBase (optional but recommended)

PayBeam stores links in PocketBase. If you skip this step, links work but are scoped to your local browser only.

**Option A — via the setup script** (downloads the binary, starts it, applies the schema):

```bash
npm run pb:setup
```

**Option B — via Docker**:

```bash
npm run pb:up
# Open http://127.0.0.1:8090/_/ to create the superuser
# Then in a fresh terminal:
PB_HOST=127.0.0.1 PB_PORT=8090 npm run pb:setup
```

Either way, PocketBase ends up running on `http://127.0.0.1:8090`.

### 3. Configure the frontend

```bash
cp frontend/.env.example frontend/.env.local
```

Open `frontend/.env.local` and set:

```env
VITE_STELLAR_NETWORK=testnet
VITE_POCKETBASE_URL=http://127.0.0.1:8090
```

### 4. Run the dev server

```bash
npm run dev
```

Open <http://localhost:5173>. Connect Freighter (set to **Test Net** in its settings), then fund yourself via [the Stellar friendbot](https://friendbot.stellar.org/).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            PayBeam frontend                              │
│         React 18 · Vite · Tailwind · Freighter · Stellar SDK             │
│                                                                          │
│  CreateLink  ─►  linkStore  ─►  PocketBase (or localStorage fallback)    │
│                                                                          │
│  LinkDetail                                                              │
│       ├── one-time / recurring  ──►  Operation.payment                   │
│       └── escrow                ──►  Operation.createClaimableBalance    │
│                                          ▲                               │
│                  Recipient claims ───────┤                               │
│                  (predicateUnconditional)│                               │
│                                          │                               │
│                  Payer claims back  ─────┘                               │
│                  (predicateNot(predicateBeforeRelativeTime))             │
│                                          │                               │
│                                          ▼                               │
│                                 Stellar Horizon (REST)                   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                  PayBeam Soroban escrow registry (optional)              │
│                  contracts/paybeam-escrow/src/lib.rs                     │
│                                                                          │
│  register_link(creator, link_id, balance_id, metadata_hash)              │
│  get_link(link_id) → LinkRecord                                          │
│  appeal_link(link_id, caller)        ◄── stub: open issue                │
│  resolve_appeal(link_id, decision)   ◄── stub: open issue                │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key design decisions

- **Claimable balances over a custom contract.** Stellar's [`Operation.createClaimableBalance`](https://developers.stellar.org/docs/learn/encyclopedia/transactions-specialized/claimable-balances) already implements every property our escrow flow needs: multi-claimant predicates, native asset support, and time-bounded auto-refund. Re-implementing this in Soroban would burn complexity for no user-visible benefit.
- **Soroban as a registry, not a vault.** The Soroban contract doesn't hold funds. It indexes link records, anchors a metadata hash for tamper-evidence, and exposes hooks for arbitration. This keeps trust assumptions minimal and makes the contract small enough to audit.
- **No backend service.** Everything the frontend needs is exposed by Stellar Horizon (read) and Freighter (sign). PocketBase covers the only piece left — storing link metadata for cross-device discovery — without us writing or hosting a custom API.
- **PocketBase over Supabase / Firebase.** Single binary, embedded SQLite, MIT-licensed. A new contributor goes from `git clone` to a working backend in under a minute, with no account creation.
- **localStorage fallback.** PayBeam is fully usable with `VITE_POCKETBASE_URL` unset — links just become device-local. This keeps the demo trivially deployable as a static site.

---

## How the escrow flow works

```
1. Creator opens /            ──► CreateLink form, picks "Escrow"
                                  Persists link record (status: pending)
                                  Generates a sharable URL /pay/<id>

2. Payer (creator) opens link ──► LinkDetail sees role=payer, status=pending
                                  Clicks "Fund Escrow"
                                  → buildCreateClaimableBalanceXdr(...)
                                  → Freighter signs
                                  → Horizon submits
                                  → extract claimable_balance_id from result
                                  → status: funded, balance_id stored

3. Recipient opens link       ──► LinkDetail sees role=recipient, status=funded
                                  Clicks "Claim Funds"
                                  → buildClaimXdr(balance_id)
                                  → Freighter signs, Horizon submits
                                  → status: released

3'. (alternate) Timeout elapses
    Payer reopens the link    ──► "Claim Back" appears (predicate now satisfied)
                                  → buildClaimXdr submits
                                  → status: refunded
```

The two claimant predicates registered in step 2:

```rust
recipient: predicateUnconditional()                         // claim anytime
creator:   predicateNot(predicateBeforeRelativeTime(t))     // claim back after timeout
```

These are evaluated by Stellar core, not by PayBeam. There is no off-chain escrow agent.

---

## Soroban contract

The optional registry contract lives in `contracts/paybeam-escrow/`. With the [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup) installed:

```bash
# Build
npm run contracts:build

# Test
npm run contracts:test

# Deploy (requires a funded testnet identity)
soroban contract deploy \
  --network testnet \
  --source <your-stellar-secret-key> \
  --wasm contracts/target/wasm32-unknown-unknown/release/paybeam_escrow.wasm
```

Set `VITE_PAYBEAM_ESCROW_CONTRACT_ID` to the deployed contract id and rebuild the frontend to enable optional on-chain registration. Two of the four contract entry points are stubbed and tagged `// TODO(contributor)` — see the [open issues](https://github.com/paybeam/paybeam/issues) labelled `good-first-issue` and `help-wanted`.

---

## Limitations

- **USDC trustline required.** Recipients must have a USDC trustline before a USDC payment / claim succeeds. The UI does not yet auto-create trustlines — see [`ROADMAP.md`](./ROADMAP.md).
- **Memo capped at 28 bytes.** Stellar's text memo limit. PayBeam silently truncates.
- **PocketBase API rules are permissive by default.** The shipped schema allows public read + write so the demo just works. For a real deployment, scope by `creator` and require [SEP-10](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md) auth — see the roadmap.
- **Soroban contract is partially implemented.** Two entry points are stubbed (see code comments).
- **Single wallet adapter.** Only Freighter for v0.1.

---

## Contributing

PayBeam is actively maintained and welcomes contributors. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow and [ROADMAP.md](./ROADMAP.md) for the prioritised work queue. Issues labelled [`good-first-issue`](https://github.com/paybeam/paybeam/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are the best entry points.

---

## License

MIT — see [LICENSE](./LICENSE).
