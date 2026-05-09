import type { PaymentLink, CreateLinkParams, LinkStatus, PaymentRecord } from "./types";
import { USDC_ISSUER } from "./configAddress";
import { pb, isPocketBaseEnabled, LINKS_COLLECTION } from "./pocketbase";

const STORAGE_KEY = "paybeam_links";

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getOrigin(): string {
  try {
    if (typeof window !== "undefined") {
      return window.location.origin || "";
    }
  } catch {
    // SecurityError in sandboxed cross-origin iframes
  }
  return "";
}

/** Safe wrapper for navigator.clipboard (falls back to noop) */
export function safeClipboardWrite(text: string): Promise<void> {
  try {
    if (navigator?.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }
  } catch {
    // ignore
  }
  return Promise.resolve();
}

export function generateLinkId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function generatePaymentId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

// ─── localStorage cache ──────────────────────────────────────────────────────

function cacheLoad(): PaymentLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function cacheSave(links: PaymentLink[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {
    // ignore — storage quota exceeded etc.
  }
}

function cacheUpsert(link: PaymentLink) {
  const links = cacheLoad();
  const idx = links.findIndex((l) => l.id === link.id);
  if (idx === -1) {
    cacheSave([link, ...links]);
  } else {
    links[idx] = link;
    cacheSave(links);
  }
}

// ─── PocketBase record ↔ PaymentLink mapping ────────────────────────────────

// PocketBase represents records as JS objects with snake_case fields. We
// translate to/from PayBeam's camelCase TypeScript shape here.

type PbRecord = Record<string, unknown> & { id: string; collectionId?: string };

function recordToLink(rec: PbRecord): PaymentLink {
  return {
    id: (rec.link_id ?? rec.id) as string,
    type: rec.type as PaymentLink["type"],
    creator: rec.creator as string,
    recipient: rec.recipient as string,
    amount: rec.amount as number,
    allowCustomAmount: !!rec.allow_custom_amount,
    tokenType: rec.token_type as PaymentLink["tokenType"],
    tokenIssuer: (rec.token_issuer as string) || null,
    status: rec.status as LinkStatus,
    memo: (rec.memo as string) ?? "",
    createdAt: (rec.created_at as string) ?? (rec.created as string),
    linkUrl: rec.link_url as string,
    expiresAt: (rec.expires_at as string) || null,
    payments: (rec.payments as PaymentRecord[]) ?? [],
    totalReceived: (rec.total_received as number) ?? 0,
    claimableBalanceId: (rec.claimable_balance_id as string) || null,
    nonce: (rec.nonce as string) || null,
    timeoutSeconds: (rec.timeout_seconds as number) ?? null,
    fundedAt: (rec.funded_at as string) || null,
    releasedAt: (rec.released_at as string) || null,
    refundedAt: (rec.refunded_at as string) || null,
    appealedAt: (rec.appealed_at as string) || null,
    appealedBy: (rec.appealed_by as string) || null,
    paidAt: (rec.paid_at as string) || null,
    txSignature: (rec.tx_signature as string) || null,
  };
}

function linkToRecord(link: PaymentLink): Record<string, unknown> {
  // We use `link_id` as a stable, user-visible identifier separate from
  // PocketBase's internal `id` field. This keeps short URLs (/pay/<link_id>)
  // independent of PocketBase's 15-char auto-id.
  return {
    link_id: link.id,
    type: link.type,
    creator: link.creator,
    recipient: link.recipient,
    amount: link.amount,
    allow_custom_amount: link.allowCustomAmount,
    token_type: link.tokenType,
    token_issuer: link.tokenIssuer,
    status: link.status,
    memo: link.memo,
    created_at: link.createdAt,
    link_url: link.linkUrl,
    expires_at: link.expiresAt,
    payments: link.payments,
    total_received: link.totalReceived,
    claimable_balance_id: link.claimableBalanceId,
    nonce: link.nonce,
    timeout_seconds: link.timeoutSeconds,
    funded_at: link.fundedAt,
    released_at: link.releasedAt,
    refunded_at: link.refundedAt,
    appealed_at: link.appealedAt,
    appealed_by: link.appealedBy,
    paid_at: link.paidAt,
    tx_signature: link.txSignature,
  };
}

// ─── Public API (all async) ──────────────────────────────────────────────────

export async function createPaymentLink(
  params: CreateLinkParams & {
    creator: string;
    claimableBalanceId?: string | null;
    nonce?: string | null;
  }
): Promise<PaymentLink> {
  const id = generateLinkId();

  const link: PaymentLink = {
    id,
    type: params.type,
    creator: params.creator,
    recipient: params.recipient,
    amount: params.amount,
    allowCustomAmount: params.allowCustomAmount,
    tokenType: params.tokenType,
    tokenIssuer: params.tokenType === "USDC" ? USDC_ISSUER : null,
    status: params.type === "escrow" ? "pending" : "active",
    memo: params.memo,
    createdAt: new Date().toISOString(),
    linkUrl: `${getOrigin()}/pay/${id}`,
    expiresAt: params.expiresAt,
    payments: [],
    totalReceived: 0,
    claimableBalanceId: params.claimableBalanceId ?? null,
    nonce: params.nonce ?? null,
    timeoutSeconds: params.timeoutSeconds ?? null,
    fundedAt: null,
    releasedAt: null,
    refundedAt: null,
    appealedAt: null,
    appealedBy: null,
    paidAt: null,
    txSignature: null,
  };

  if (isPocketBaseEnabled && pb) {
    try {
      await pb.collection(LINKS_COLLECTION).create(linkToRecord(link));
    } catch (err) {
      console.error("[linkStore] PocketBase create error:", err);
      // Fall through — still cache locally so the UI works
    }
  }

  cacheUpsert(link);
  return link;
}

/**
 * Look up by our user-facing `link_id` (NOT PocketBase's auto id). PocketBase's
 * `getFirstListItem` queries by filter — we use it instead of `getOne` for
 * this reason.
 */
export async function getLinkById(id: string): Promise<PaymentLink | undefined> {
  if (isPocketBaseEnabled && pb) {
    try {
      const rec = await pb
        .collection(LINKS_COLLECTION)
        .getFirstListItem(`link_id = "${id}"`);
      const link = recordToLink(rec as PbRecord);
      cacheUpsert(link);
      return link;
    } catch (err) {
      // 404s are expected (link not in remote yet); only log other errors.
      const status = (err as { status?: number })?.status;
      if (status && status !== 404) {
        console.error("[linkStore] getLinkById error:", err);
      }
    }
  }

  return cacheLoad().find((l) => l.id === id);
}

export async function getAllLinks(): Promise<PaymentLink[]> {
  if (isPocketBaseEnabled && pb) {
    try {
      const records = await pb
        .collection(LINKS_COLLECTION)
        .getFullList({ sort: "-created_at" });
      const links = records.map((r) => recordToLink(r as PbRecord));
      cacheSave(links);
      return links;
    } catch (err) {
      console.error("[linkStore] getAllLinks error:", err);
    }
  }
  return cacheLoad();
}

export async function getLinksByWallet(wallet: string): Promise<PaymentLink[]> {
  if (isPocketBaseEnabled && pb) {
    try {
      const records = await pb.collection(LINKS_COLLECTION).getFullList({
        filter: `creator = "${wallet}" || recipient = "${wallet}"`,
        sort: "-created_at",
      });
      const links = records.map((r) => recordToLink(r as PbRecord));
      // Merge into cache without overwriting unrelated links
      const cached = cacheLoad();
      const merged = [
        ...links,
        ...cached.filter((c) => !links.find((l) => l.id === c.id)),
      ];
      cacheSave(merged);
      return links;
    } catch (err) {
      console.error("[linkStore] getLinksByWallet error:", err);
    }
  }

  return cacheLoad().filter(
    (l) => l.creator === wallet || l.recipient === wallet
  );
}

export async function updateLinkStatus(
  id: string,
  status: LinkStatus,
  extra?: Partial<PaymentLink>
): Promise<PaymentLink | undefined> {
  const existing = await getLinkById(id);
  if (!existing) return undefined;

  const updated: PaymentLink = { ...existing, status, ...extra };

  if (isPocketBaseEnabled && pb) {
    try {
      const rec = await pb
        .collection(LINKS_COLLECTION)
        .getFirstListItem(`link_id = "${id}"`);
      await pb
        .collection(LINKS_COLLECTION)
        .update(rec.id, linkToRecord(updated));
    } catch (err) {
      console.error("[linkStore] updateLinkStatus error:", err);
    }
  }

  cacheUpsert(updated);
  return updated;
}

export async function appealEscrow(
  linkId: string,
  appealerAddress: string
): Promise<PaymentLink | undefined> {
  const link = await getLinkById(linkId);
  if (!link) return undefined;
  if (link.type !== "escrow" || link.status !== "funded") return undefined;
  if (appealerAddress !== link.creator && appealerAddress !== link.recipient)
    return undefined;

  return updateLinkStatus(linkId, "appealed", {
    appealedAt: new Date().toISOString(),
    appealedBy: appealerAddress,
  });
}

export async function recordPayment(
  linkId: string,
  payment: Omit<PaymentRecord, "id">
): Promise<PaymentLink | undefined> {
  const link = await getLinkById(linkId);
  if (!link) return undefined;

  const record: PaymentRecord = { id: generatePaymentId(), ...payment };
  const payments = [record, ...(link.payments || [])];
  const totalReceived = (link.totalReceived || 0) + payment.amount;

  const extra: Partial<PaymentLink> =
    link.type === "one-time"
      ? {
          payments,
          totalReceived,
          status: "completed",
          paidAt: payment.paidAt,
          txSignature: payment.txSignature,
        }
      : { payments, totalReceived };

  return updateLinkStatus(linkId, link.type === "one-time" ? "completed" : link.status, extra);
}
