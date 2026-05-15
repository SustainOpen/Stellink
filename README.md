<div align="center">

# Stellink

**Stop wiring up checkouts. Send a link.**

Stellink turns your Stellar address into a payment URL — for invoices you'd normally chase, subscriptions you'd normally build, and trades you'd normally argue over. Same five-second settlement on every one.

[![Stellar](https://img.shields.io/badge/Stellar-Testnet-22d3ee?style=flat-square)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Soroban-Rust-14b8a6?style=flat-square)](https://soroban.stellar.org)
[![License](https://img.shields.io/badge/License-MIT-94a3b8?style=flat-square)](./LICENSE)

</div>

---

No API key. No checkout SDK. No custodian. The link itself is the integration — paste it on a website, in an email, in a DM, on a QR sticker — and anyone with a Stellar wallet can pay.

The link works in three modes, picked when you create it:

- **One-time** — a single fixed payment. Closes itself after it's paid. Good for invoices, tips, donations.
- **Recurring** — accepts unlimited payments on the same URL. Good for tip jars, storefront checkout, subscription handles.
- **Escrow** — funds get locked in a Stellar [claimable balance](https://developers.stellar.org/docs/learn/encyclopedia/transactions-specialized/claimable-balances). The recipient claims when ready; the payer can reclaim after a configurable timeout. Good for freelance work, peer-to-peer trades, anything that needs a holding period.

The escrow flow uses Stellar's native primitives — no custom contract is mandatory. A small Soroban contract layers a registry and arbitration hook on top for projects that need it.

---

## Why this exists

Most payment-link products on Web3 either (a) lock you into a centralised checkout, or (b) ship as a chain-native primitive that only works for native gas tokens with no UX. Stellink takes the middle path:

| | Stripe Payment Links | A typical chain-native sender | Stellink |
|---|---|---|---|
| Custodian | Stripe | None | None |
| Settlement time | Hours / days | Seconds | **5 seconds** (Stellar finality) |
| Asset support | Fiat | One token | XLM, USDC, any Stellar issued asset |
| Escrow | No | Custom contract | Stellar claimable balance (no contract required) |
| Self-host | No | n/a | Yes — single binary backend |
| Integrate as a merchant | API + SDK + webhooks | Custom | Just paste the URL |

Stellink is opinionated about being **the smallest possible thing that works**. The frontend is a static React app. The "backend" is a 30-MB PocketBase binary. The on-chain logic is whatever Stellar core already does. There is no custom indexer, no relayer service, no proprietary API.

---

## Try it locally

```bash
git clone https://github.com/SustainOpen/Stellink.git
cd stellink
npm install
npm run test

# Optional: spin up PocketBase for cross-device link storage.
# (Skip this and links will be scoped to your local browser.)
npm run pb:setup

# Run the app
npm run dev
```

Open <http://localhost:5173>, install [Freighter](https://www.freighter.app/) if you don't have it, switch Freighter to **Test Net**, and fund yourself via [the friendbot](https://friendbot.stellar.org/). You're sending payment links in under a minute.

---

## How a payment moves

For a **one-time** or **recurring** link the flow is two transactions:

```
Creator    ── creates link ──►  PocketBase / localStorage
Payer      ── opens link ────►  buildPaymentXdr()
                              ──► Freighter signs
                              ──► Horizon submits
                              ──► payment lands in recipient's account
```

For an **escrow** link there's an extra hop, but no smart contract is involved:

```
1. Creator creates link              status = pending
2. Payer opens link, hits "Fund"     Operation.createClaimableBalance
                                     status = funded
                                     claimable_balance_id stored

3a. Recipient opens, hits "Claim"    Operation.claimClaimableBalance
                                     status = released
3b. (else) Timeout elapses
    Payer hits "Claim back"          Operation.claimClaimableBalance
                                     status = refunded
```

The two claimant predicates registered when the balance is created:

```rust
recipient: predicateUnconditional()                       // claim anytime
creator:   predicateNot(predicateBeforeRelativeTime(t))   // claim back after timeout
```

Stellar core enforces these. There is no off-chain escrow agent and no contract authority — the payer literally cannot reclaim before the timeout, even by editing the database, because the chain rejects the operation.

---

## Repository layout

```
stellink/
├── frontend/              Vite + React + Tailwind app — the entire user surface
│   ├── src/
│   │   ├── components/      CreateLink, LinkDetail, Dashboard, Header, WalletButton
│   │   ├── hooks/           useStellarWallet (Freighter integration)
│   │   ├── lib/             stellar tx builders, link store, types, pocketbase client
│   │   └── pages/
│   ├── public/
│   └── package.json
│
├── contracts/             Soroban escrow registry (Rust)
│   └── stellink-escrow/
│       └── src/
│           ├── lib.rs       StellinkEscrow contract
│           └── test.rs      cargo test suite
│
├── scripts/
│   ├── pocketbase-setup.sh        one-shot: download + start + apply schema
│   └── pocketbase-schema.json     canonical collection definition
│
├── docker-compose.yml             PocketBase via Docker (alternative to native binary)
├── package.json                   npm workspaces glue + top-level scripts
├── README.md                      ← you are here
├── CONTRIBUTING.md
├── ROADMAP.md
└── LICENSE
```

There is intentionally no backend folder. The frontend talks directly to:

- **Freighter** for signing
- **Horizon** (Stellar's public REST API) for transaction submission and history
- **PocketBase** for cross-device link persistence — and falls back to `localStorage` when no PocketBase URL is configured

This keeps the trust surface tiny and the deployment story simple. A static-site host (Vercel, Cloudflare Pages, GitHub Pages) is enough to run the frontend in production.

---

## Configuration

Create `frontend/.env.local`:

```env
# "testnet" (default) or "public" for mainnet
VITE_STELLAR_NETWORK=testnet

# Optional. Without this, links live in localStorage only.
VITE_POCKETBASE_URL=http://127.0.0.1:8090

# Optional. Soroban escrow registry contract id, if you've deployed it.
VITE_STELLINK_ESCROW_CONTRACT_ID=
```

That's the whole config surface.

---

## Soroban contract

The optional registry contract lives in `contracts/stellink-escrow/`. It does **not** hold funds — claimable balances handle that. It indexes link records on-chain so an arbiter can later resolve disputes, and so a future indexer can verify integrity from a hash commit.

```bash
# Build
npm run contracts:build

# Test
npm run contracts:test

# Deploy (requires a funded testnet identity)
soroban contract deploy \
  --network testnet \
  --source <your-stellar-secret-key> \
  --wasm contracts/target/wasm32-unknown-unknown/release/stellink_escrow.wasm
```

Two of the four entry points (`appeal_link`, `resolve_appeal`) are deliberately stubbed. They're tagged `// TODO(contributor)` and described in [ROADMAP.md](./ROADMAP.md) — implementing them is a clean, self-contained contribution.

---

## Status

Stellink is **v0.1**. The happy paths work end-to-end on Stellar testnet:

- ✅ Create one-time, recurring, and escrow links
- ✅ Pay one-time and recurring links via Freighter
- ✅ Fund escrow as a claimable balance, claim it, claim back after timeout
- ✅ Per-wallet dashboard with link history
- ✅ Soroban registry: `register_link`, `get_link`

Known gaps before v1.0 are tracked in [ROADMAP.md](./ROADMAP.md):

- USDC trustline auto-creation
- Multi-wallet support (Albedo, xBull, Lobstr, …)
- SEP-10 auth + tightened PocketBase rules
- Soroban `appeal_link` and `resolve_appeal`
- Email / webhook notifications
- Frontend test harness

---

## Contributing

Stellink is actively maintained and welcomes contributors. The shortest path:

1. Find an issue labelled [`good-first-issue`](https://github.com/SustainOpen/Stellink/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
2. Comment on it so we know you're picking it up.
3. Open a PR.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

---

## License

MIT — see [LICENSE](./LICENSE).
