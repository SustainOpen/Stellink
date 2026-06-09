/**
 * Stellink — Stellar transaction builders.
 *
 * We use Stellar's built-in primitives:
 *   - `Operation.payment` for one-time and recurring direct payments
 *   - `Operation.createClaimableBalance` for the escrow flow (fund step)
 *   - `Operation.claimClaimableBalance` for release/refund
 *
 * Claimable balances natively support multi-claimant predicates (e.g.
 * "recipient can claim after 0 seconds, creator can claim after timeout"),
 * giving us auto-refund without any custom contract.
 *
 * All transactions are returned as XDR strings. The Freighter wallet bridge
 * signs them and submits the result to Horizon.
 */

import {
  Asset,
  Claimant,
  Horizon,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  Memo,
  Keypair,
  xdr,
  Contract,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import {
  HORIZON_URL,
  STELLAR_NETWORK_PASSPHRASE,
  USDC_ISSUER,
} from "./configAddress";
import type { TokenType } from "./types";

/** Singleton Horizon server */
export const horizon = new Horizon.Server(HORIZON_URL);

/** Resolve a Stellar Asset for the given Stellink token type */
export function getAsset(tokenType: TokenType): Asset {
  if (tokenType === "XLM") return Asset.native();
  return new Asset("USDC", USDC_ISSUER);
}

/** Format a number to Stellar's 7-decimal string (the SDK only accepts strings) */
export function toStellarAmount(amount: number): string {
  // Stellar enforces 7 decimal places. Strip extra precision and avoid sci-notation.
  return amount.toFixed(7);
}

/** Sum of native lumens balance for an account, or 0 if unfunded */
export async function fetchXlmBalance(address: string): Promise<number> {
  try {
    const account = await horizon.loadAccount(address);
    const native = account.balances.find((b) => b.asset_type === "native");
    return native ? parseFloat(native.balance) : 0;
  } catch {
    return 0;
  }
}

/** Fund a brand-new testnet account via Friendbot. No-op on mainnet. */
export async function friendbotFund(address: string): Promise<boolean> {
  if (STELLAR_NETWORK_PASSPHRASE !== "Test SDF Network ; September 2015") {
    return false;
  }
  try {
    const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    return res.ok;
  } catch {
    return false;
  }
}

/* ============================================================
   Transaction builders — return unsigned XDR strings
   ============================================================ */

interface BuildPaymentOptions {
  source: string;            // payer (G...)
  destination: string;       // recipient (G...)
  amount: number;            // human-readable amount (e.g. 1.5)
  tokenType: TokenType;
  memo?: string;
}

/**
 * Build a direct payment transaction (one-time / recurring).
 * Returns the unsigned transaction XDR.
 */
export async function buildPaymentXdr(opts: BuildPaymentOptions): Promise<string> {
  const account = await horizon.loadAccount(opts.source);
  const asset = getAsset(opts.tokenType);

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: opts.destination,
        asset,
        amount: toStellarAmount(opts.amount),
      })
    )
    .setTimeout(180);

  if (opts.memo) {
    // Stellar memos cap at 28 bytes for text memos. Truncate just in case.
    builder.addMemo(Memo.text(opts.memo.slice(0, 28)));
  }

  return builder.build().toXDR();
}

interface BuildClaimableBalanceOptions {
  source: string;            // payer / creator (G...)
  recipient: string;         // recipient (G...)
  amount: number;
  tokenType: TokenType;
  /** seconds until the creator can also claim back (auto-refund). null = no refund window. */
  timeoutSeconds: number | null;
  memo?: string;
}

/**
 * Build a `createClaimableBalance` transaction. This is Stellink's escrow primitive.
 *
 * Claimants:
 *   - Recipient: claimable immediately (predicate = unconditional)
 *   - Creator (refund): claimable after `timeoutSeconds` if set, otherwise NEVER
 *
 * The balance ID is deterministic and can be predicted from the source account
 * sequence number; we read it back from the transaction result after submission.
 */
export async function buildCreateClaimableBalanceXdr(
  opts: BuildClaimableBalanceOptions
): Promise<string> {
  const account = await horizon.loadAccount(opts.source);
  const asset = getAsset(opts.tokenType);

  // Recipient predicate: unconditional ("can claim now")
  const recipientPredicate = Claimant.predicateUnconditional();

  // Creator predicate: only valid after the timeout has elapsed; otherwise NEVER claim back
  const creatorPredicate = opts.timeoutSeconds
    ? Claimant.predicateNot(
        Claimant.predicateBeforeRelativeTime(opts.timeoutSeconds.toString())
      )
    : // No timeout configured -> creator can never reclaim. This is the "trustful" mode.
      // We model it as predicateNot(predicateUnconditional) which is permanently false.
      Claimant.predicateNot(Claimant.predicateUnconditional());

  const claimants = [
    new Claimant(opts.recipient, recipientPredicate),
    new Claimant(opts.source, creatorPredicate),
  ];

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.createClaimableBalance({
        asset,
        amount: toStellarAmount(opts.amount),
        claimants,
      })
    )
    .setTimeout(180);

  if (opts.memo) {
    builder.addMemo(Memo.text(opts.memo.slice(0, 28)));
  }

  return builder.build().toXDR();
}

interface BuildClaimOptions {
  source: string;             // claimant (G...)
  balanceId: string;          // claimable balance id (hex)
}

/**
 * Build a `claimClaimableBalance` transaction. Used both for:
 *   - Release: payer claims and immediately re-pays the recipient (3-op tx, see below), OR
 *   - Refund: payer claims back after timeout
 *
 * For the simple flow we emit just the claim op; the recipient or payer is the
 * destination of the funds based on which account submitted the claim.
 */
export async function buildClaimXdr(opts: BuildClaimOptions): Promise<string> {
  const account = await horizon.loadAccount(opts.source);

  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.claimClaimableBalance({
        balanceId: opts.balanceId,
      })
    )
    .setTimeout(180)
    .build()
    .toXDR();
}

/**
 * Submit a signed transaction XDR to Horizon. Returns the tx hash on success.
 * Throws with a Horizon error description on failure.
 */
export async function submitSignedXdr(signedXdr: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(signedXdr, STELLAR_NETWORK_PASSPHRASE);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await horizon.submitTransaction(tx as any);
  return res.hash;
}

/**
 * Extract the claimable balance id created by a transaction. We need this to
 * persist the escrow's on-chain handle so either party can later claim it.
 *
 * Stellar exposes the balance id in the operation result (`createClaimableBalanceResult`).
 */
export async function extractClaimableBalanceId(txHash: string): Promise<string | null> {
  try {
    const ops = await horizon.operations().forTransaction(txHash).call();
    const createOp = ops.records.find(
      (op) => op.type === "create_claimable_balance"
    );
    if (!createOp) return null;

    // The Horizon API surfaces the balance id directly on a follow-up effect or
    // via the operation's "claimable_balance_id" extension (newer Horizon versions).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = (createOp as any).claimable_balance_id as string | undefined;
    if (id) return id;

    // Fallback: pull from the effects endpoint.
    const effects = await horizon
      .effects()
      .forOperation(createOp.id)
      .call();
    const cbEffect = effects.records.find(
      (e) => e.type === "claimable_balance_created"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cbEffect as any)?.balance_id ?? null;
  } catch (err) {
    console.error("[stellar] extractClaimableBalanceId failed:", err);
    return null;
  }
}

/**
 * Quickly verify a Stellar address is well-formed by trying to construct a
 * Keypair from it. (Real validation lives in `isValidStellarAddress` from types.ts;
 * this re-export saves an extra import in components that already pull from here.)
 */
export function isAddress(address: string): boolean {
  try {
    Keypair.fromPublicKey(address);
    return true;
  } catch {
    return false;
  }
}

interface BuildRegisterLinkOptions {
  contractId: string;
  creator: string;
  recipient: string | null;
  linkId: string;
  claimableBalanceId: string | null;
  amount: number;
  tokenType: string;
  memo: string | null;
}

/**
 * Build the Soroban transaction call to register_link on-chain.
 */
export async function buildRegisterLinkXdr(opts: BuildRegisterLinkOptions): Promise<string> {
  const account = await horizon.loadAccount(opts.creator);
  const contract = new Contract(opts.contractId);

  const encoder = new TextEncoder();
  const idData = encoder.encode(opts.linkId);
  const hashBuffer = await crypto.subtle.digest("SHA-256", idData);
  const linkIdBytes = new Uint8Array(hashBuffer);

  const metaData = encoder.encode(
    JSON.stringify({
      amount: opts.amount,
      tokenType: opts.tokenType,
      memo: opts.memo,
    })
  );
  const metaHashBuffer = await crypto.subtle.digest("SHA-256", metaData);
  const metaHashBytes = new Uint8Array(metaHashBuffer);

  const registerOp = contract.call(
    "register_link",
    nativeToScVal(opts.creator, { type: "address" }),
    opts.recipient ? nativeToScVal(opts.recipient, { type: "address" }) : nativeToScVal(null),
    nativeToScVal(linkIdBytes, { type: "bytes" }),
    opts.claimableBalanceId ? nativeToScVal(opts.claimableBalanceId, { type: "string" }) : nativeToScVal(null),
    nativeToScVal(metaHashBytes, { type: "bytes" })
  );

  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(registerOp)
    .setTimeout(180)
    .build()
    .toXDR();
}

// Silence unused import warning when xdr is not referenced directly.
// (kept available for downstream type consumers)
export type { xdr };
