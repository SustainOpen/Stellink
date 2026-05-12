/**
 * Stellink — core types
 *
 * Stellar-native payment link primitives. We use:
 *   - Native payments for one-time / recurring (Stellar payment op)
 *   - Claimable balances (Stellar native escrow primitive) for the escrow flow
 */

import { StrKey } from "@stellar/stellar-sdk";

/** Payment link type */
export type LinkType = "one-time" | "recurring" | "escrow";

/** Status for all link types */
export type LinkStatus =
  | "active"           // Recurring: accepting payments. One-time: awaiting payment
  | "completed"        // One-time: paid. Escrow: released
  | "pending"          // Escrow: created off-chain, not yet funded
  | "funded"           // Escrow: claimable balance created on-chain, awaiting release
  | "released"         // Escrow: claimed by recipient
  | "refunded"         // Escrow: claimed back by payer
  | "appealed"         // Escrow: suspended by either party, awaiting arbitration
  | "expired";         // Link has expired (any type)

/** Escrow user role relative to a link */
export type EscrowRole = "payer" | "recipient" | "none";

/** Determine the connected wallet's role on an escrow link */
export function getEscrowRole(link: PaymentLink, walletAddress: string | null): EscrowRole {
  if (!walletAddress) return "none";
  // If creator set themselves as recipient, they intend to receive —
  // treat them as recipient so they see the correct actions.
  // Anyone else who opens the link (the actual funder) is the payer.
  if (link.creator === link.recipient) {
    if (walletAddress === link.recipient) return "recipient";
    return "payer";
  }
  if (walletAddress === link.creator) return "payer";
  if (walletAddress === link.recipient) return "recipient";
  return "none";
}

/** Tokens supported by Stellink on Stellar */
export type TokenType = "XLM" | "USDC";

/** A single payment received on a link */
export interface PaymentRecord {
  id: string;
  payer: string;
  amount: number;
  tokenType: TokenType;
  /** Stellar transaction hash (64 char hex) */
  txSignature: string;
  paidAt: string;
}

export interface PaymentLink {
  id: string;
  type: LinkType;
  /** Stellar G... address of the creator */
  creator: string;
  /** Stellar G... address of the intended recipient */
  recipient: string;
  amount: number;           // Fixed amount (0 = custom/any amount for recurring)
  allowCustomAmount: boolean; // If true, payer can enter any amount (recurring only)
  tokenType: TokenType;
  /** USDC asset issuer on Stellar (null for XLM) */
  tokenIssuer: string | null;
  status: LinkStatus;
  memo: string;
  createdAt: string;
  linkUrl: string;

  // Expiry (null = never expires, infinite link)
  expiresAt: string | null;

  // Recurring fields
  payments: PaymentRecord[];
  totalReceived: number;

  // Escrow-specific fields (null for direct)
  /** Stellar Claimable Balance ID (hex, 72 chars) */
  claimableBalanceId: string | null;
  nonce: string | null;
  timeoutSeconds: number | null;
  fundedAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  appealedAt: string | null;
  appealedBy: string | null;

  // One-time direct fields
  paidAt: string | null;
  txSignature: string | null;
}

export interface CreateLinkParams {
  type: LinkType;
  recipient: string;
  amount: number;
  allowCustomAmount: boolean;
  tokenType: TokenType;
  memo: string;
  expiresAt: string | null;
  // Escrow only
  timeoutSeconds?: number | null;
}

/**
 * USDC on Stellar
 *  - Mainnet issuer: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN (Circle)
 *  - Testnet issuer: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 (Circle test issuer)
 *
 * We default to testnet because Stellink targets Stellar testnet for the demo.
 */
export const USDC_ISSUER_TESTNET =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const USDC_ISSUER_MAINNET =
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

export const TOKEN_LABELS: Record<TokenType, string> = {
  XLM: "XLM",
  USDC: "USDC",
};

/**
 * Stellar uses 7 decimal places ("stroops") for ALL native and issued assets.
 * 1 XLM = 10_000_000 stroops. USDC is the same — we always pass 7-decimal strings to the SDK.
 */
export const STELLAR_DECIMALS = 7;

export const TOKEN_DECIMALS: Record<TokenType, number> = {
  XLM: STELLAR_DECIMALS,
  USDC: STELLAR_DECIMALS,
};

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** True if the string is a syntactically valid Stellar G... address. */
export function isValidStellarAddress(address: string): boolean {
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function isLinkExpired(link: PaymentLink): boolean {
  if (!link.expiresAt) return false;
  return new Date(link.expiresAt).getTime() < Date.now();
}

export function getExpiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return "Never";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  return formatCountdown(Math.floor(diff / 1000));
}

export function getTypeLabel(type: LinkType): string {
  switch (type) {
    case "one-time": return "One-time";
    case "recurring": return "Recurring";
    case "escrow": return "Escrow";
  }
}

export function getTypeColor(type: LinkType): string {
  switch (type) {
    case "one-time": return "type-onetime";
    case "recurring": return "type-recurring";
    case "escrow": return "type-escrow";
  }
}

export function getStatusColor(status: LinkStatus): string {
  switch (status) {
    case "active":
      return "status-active";
    case "pending":
      return "status-pending";
    case "funded":
      return "status-funded";
    case "completed":
    case "released":
      return "status-released";
    case "appealed":
      return "status-appealed";
    case "refunded":
    case "expired":
      return "status-refunded";
    default:
      return "";
  }
}

export function getStatusLabel(status: LinkStatus): string {
  switch (status) {
    case "active": return "Active";
    case "completed": return "Completed";
    case "pending": return "Pending";
    case "funded": return "Funded";
    case "released": return "Released";
    case "refunded": return "Refunded";
    case "appealed": return "Under Appeal";
    case "expired": return "Expired";
    default: return status;
  }
}

/** Check if the escrow timeout has elapsed (auto-refund eligible) */
export function isEscrowTimedOut(link: PaymentLink): boolean {
  if (link.type !== "escrow" || link.status !== "funded") return false;
  if (!link.fundedAt || !link.timeoutSeconds) return false;
  const deadline = new Date(link.fundedAt).getTime() + link.timeoutSeconds * 1000;
  return Date.now() >= deadline;
}

/* ============================================================
   Horizon error helpers — used by the payment flow to decode
   Stellar transaction result codes into user-friendly messages.
   ============================================================ */

/** Known Horizon transaction result codes. */
export const HORIZON_ERROR_CODES = {
  /** The destination account does not trust the asset being sent. */
  OP_NO_TRUST: "op_no_trust",
} as const;

/**
 * Check whether a caught error matches a specific Horizon transaction
 * result code. Horizon surfaces result codes inside the error message
 * string on failed submissions.
 *
 * @example
 *   try { await submitSignedXdr(xdr); } catch (err) {
 *     if (isHorizonError(err, HORIZON_ERROR_CODES.OP_NO_TRUST)) {
 *       // Handle missing trustline
 *     }
 *   }
 */
export function isHorizonError(err: unknown, code: string): boolean {
  if (err instanceof Error) {
    return err.message.toLowerCase().includes(code.toLowerCase());
  }
  return false;
}
