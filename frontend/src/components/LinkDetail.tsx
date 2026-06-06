import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Shield,
  Repeat,
  ArrowUpRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink,
  Timer,
  ArrowLeft,
  CalendarClock,
  Hash,
  AlertTriangle,
  Info,
  Ban,
  Undo2,
  Send,
  Clock,
  Infinity as InfinityIcon,
  QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getLinkById,
  updateLinkStatus,
  recordPayment,
  appealEscrow,
  safeClipboardWrite,
} from "@/lib/linkStore";
import {
  buildPaymentXdr,
  buildCreateClaimableBalanceXdr,
  buildClaimXdr,
  extractClaimableBalanceId,
} from "@/lib/stellar";
import {
  shortenAddress,
  formatCountdown,
  getStatusColor,
  getStatusLabel,
  getTypeLabel,
  getTypeColor,
  getExpiryLabel,
  isLinkExpired,
  isEscrowTimedOut,
  getEscrowRole,
  TOKEN_LABELS,
} from "@/lib/types";
import type { PaymentLink, EscrowRole } from "@/lib/types";
import { explorerTxUrl, explorerClaimableBalanceUrl } from "@/lib/configAddress";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/lib/walletContext";

/* ============================================================
   Escrow Explainer Component
   ============================================================ */
const EscrowExplainer: React.FC<{ role: EscrowRole; status: string }> = ({ role, status }) => {
  if (status === "pending") {
    return (
      <div className="p-4 rounded-lg bg-secondary/80 border border-border space-y-2">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">How Escrow Works</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              The <span className="text-foreground font-medium">payer (creator)</span> funds the escrow as a Stellar
              claimable balance. Once funded, the recipient can claim immediately. The payer can claim back after the
              auto-refund timeout. Either party may file an appeal to suspend the escrow for arbitration.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "funded") {
    return (
      <div className="p-4 rounded-lg bg-secondary/80 border border-border space-y-3">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs font-semibold text-foreground">Escrow is funded and active</p>
        </div>
        <div className="space-y-2 pl-6">
          {role === "payer" && (
            <>
              <RuleLine
                icon={<CheckCircle className="h-3 w-3 text-primary" />}
                text="You can release funds to the recipient at any time."
              />
              <RuleLine
                icon={<Clock className="h-3 w-3 text-muted-foreground" />}
                text="After the timeout, you can claim the balance back yourself."
              />
              <RuleLine
                icon={<AlertTriangle className="h-3 w-3 text-orange-400" />}
                text="You can appeal to suspend the escrow for manual arbitration."
              />
            </>
          )}
          {role === "recipient" && (
            <>
              <RuleLine
                icon={<CheckCircle className="h-3 w-3 text-primary" />}
                text="You can claim the funds at any time."
              />
              <RuleLine
                icon={<Undo2 className="h-3 w-3 text-destructive" />}
                text="You may also request a refund/reversal back to the payer."
              />
              <RuleLine
                icon={<AlertTriangle className="h-3 w-3 text-orange-400" />}
                text="You can appeal to suspend the escrow for manual arbitration."
              />
            </>
          )}
          {role === "none" && (
            <RuleLine
              icon={<Info className="h-3 w-3 text-muted-foreground" />}
              text="Only the payer and recipient can interact with this escrow."
            />
          )}
        </div>
      </div>
    );
  }

  if (status === "appealed") {
    return (
      <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20 space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-orange-300">Escrow Under Appeal</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This escrow has been suspended in the UI. The on-chain claimable balance still exists — both parties
              should contact arbitration before claiming.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

const RuleLine: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-start gap-2">
    <span className="mt-0.5 flex-shrink-0">{icon}</span>
    <p className="text-[11px] text-muted-foreground leading-relaxed">{text}</p>
  </div>
);

/* ============================================================
   Main LinkDetail Component
   ============================================================ */
const LinkDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { publicKey, signAndSubmit } = useWallet();
  const { toast } = useToast();

  const [link, setLink] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [showQr, setShowQr] = useState(false);

  const walletAddress = publicKey;
  const role: EscrowRole = link ? getEscrowRole(link, walletAddress) : "none";

  const loadLink = useCallback(async () => {
    if (!id) return;
    const found = await getLinkById(id);
    if (found) {
      if (isLinkExpired(found) && found.status === "active") {
        await updateLinkStatus(found.id, "expired");
        found.status = "expired";
      }
      // Auto-refund timeout: just mark as eligible. Actual on-chain claim still
      // requires the payer to submit a transaction.
      if (found.type === "escrow" && found.status === "funded" && isEscrowTimedOut(found)) {
        // We don't auto-flip to refunded — the chain remains the source of truth.
        // The payer must claim back; UI surfaces the action.
      }
    }
    setLink(found || null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadLink();
  }, [loadLink]);

  // Countdown timer for escrow timeout
  useEffect(() => {
    if (!link || link.type !== "escrow" || !link.fundedAt || !link.timeoutSeconds) return;
    if (link.status !== "funded") return;

    const fundedTime = new Date(link.fundedAt).getTime();
    const expiresAt = fundedTime + link.timeoutSeconds * 1000;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [link]);

  const [expiryCountdown, setExpiryCountdown] = useState<string | null>(null);
  useEffect(() => {
    if (!link || !link.expiresAt) return;
    const interval = setInterval(() => {
      setExpiryCountdown(getExpiryLabel(link.expiresAt));
    }, 1000);
    setExpiryCountdown(getExpiryLabel(link.expiresAt));
    return () => clearInterval(interval);
  }, [link]);

  // ===== Direct / Recurring Payment =====
  const handleDirectPay = async () => {
    if (!publicKey || !link) return;

    const payAmount =
      link.allowCustomAmount && link.type === "recurring"
        ? parseFloat(customAmount)
        : link.amount;

    if (!payAmount || payAmount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }

    setActionLoading(true);
    try {
      const xdr = await buildPaymentXdr({
        source: publicKey,
        destination: link.recipient,
        amount: payAmount,
        tokenType: link.tokenType,
        memo: link.memo || undefined,
      });

      const hash = await signAndSubmit(xdr);
      setTxSig(hash);

      await recordPayment(link.id, {
        payer: publicKey,
        amount: payAmount,
        tokenType: link.tokenType,
        txSignature: hash,
        paidAt: new Date().toISOString(),
      });

      loadLink();
      toast({
        title: "Payment sent",
        description: `${payAmount} ${TOKEN_LABELS[link.tokenType]} sent to ${shortenAddress(link.recipient)}`,
      });
      setCustomAmount("");
    } catch (err) {
      toast({
        title: "Transaction failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ===== Escrow: Fund (payer creates the claimable balance) =====
  const handleFundEscrow = async () => {
    if (!publicKey || !link) return;
    if (role !== "payer") return;
    setActionLoading(true);

    try {
      const xdr = await buildCreateClaimableBalanceXdr({
        source: publicKey,
        recipient: link.recipient,
        amount: link.amount,
        tokenType: link.tokenType,
        timeoutSeconds: link.timeoutSeconds,
        memo: link.memo || undefined,
      });

      const hash = await signAndSubmit(xdr);
      setTxSig(hash);

      // Pull the resulting claimable balance id so claims can target it later.
      const balanceId = await extractClaimableBalanceId(hash);

      await updateLinkStatus(link.id, "funded", {
        fundedAt: new Date().toISOString(),
        claimableBalanceId: balanceId,
        txSignature: hash,
      });
      loadLink();

      toast({
        title: "Escrow funded",
        description: balanceId ? `Claimable balance ${shortenAddress(balanceId, 6)}` : `Tx: ${shortenAddress(hash, 6)}`,
      });
    } catch (err) {
      toast({
        title: "Transaction failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ===== Escrow: Release =====
  // The payer can't directly transfer the claimable balance to the recipient,
  // but they can prompt the recipient to claim, OR the payer can claim+repay.
  // Simplest UX: when "release" is clicked by the payer, we mark released and
  // let the recipient claim. (The recipient's claim predicate is unconditional,
  // so they can do this anytime — release is essentially a UI state nudge.)
  const handleReleaseEscrow = async () => {
    if (!publicKey || !link || !link.claimableBalanceId) return;
    if (role !== "recipient") {
      toast({
        title: "Only the recipient can claim",
        description: "Ask the recipient to open this link and click Claim.",
      });
      return;
    }
    setActionLoading(true);
    try {
      const xdr = await buildClaimXdr({
        source: publicKey,
        balanceId: link.claimableBalanceId,
      });
      const hash = await signAndSubmit(xdr);
      setTxSig(hash);
      await updateLinkStatus(link.id, "released", {
        releasedAt: new Date().toISOString(),
        txSignature: hash,
      });
      loadLink();
      toast({ title: "Funds claimed", description: `Tx: ${shortenAddress(hash, 6)}` });
    } catch (err) {
      toast({
        title: "Claim failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ===== Escrow: Refund =====
  // Payer claims back (only valid after timeout per the predicate).
  const handleRefundEscrow = async () => {
    if (!publicKey || !link || !link.claimableBalanceId) return;
    if (role !== "payer") return;
    setActionLoading(true);
    try {
      const xdr = await buildClaimXdr({
        source: publicKey,
        balanceId: link.claimableBalanceId,
      });
      const hash = await signAndSubmit(xdr);
      setTxSig(hash);
      await updateLinkStatus(link.id, "refunded", {
        refundedAt: new Date().toISOString(),
        txSignature: hash,
      });
      loadLink();
      toast({ title: "Escrow refunded to payer" });
    } catch (err) {
      toast({
        title: "Refund failed",
        description:
          err instanceof Error
            ? err.message
            : "Unknown error (timeout may not have elapsed yet)",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ===== Escrow: Appeal (UI only) =====
  const handleAppealEscrow = async () => {
    if (!walletAddress || !link) return;
    if (role !== "payer" && role !== "recipient") return;
    setActionLoading(true);
    try {
      const updated = await appealEscrow(link.id, walletAddress);
      if (!updated) throw new Error("Unable to appeal this escrow");
      loadLink();
      toast({
        title: "Appeal filed",
        description: "Escrow is suspended in the UI pending arbitration.",
      });
    } catch (err) {
      toast({
        title: "Appeal failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ===== Renders =====

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!link) {
    return (
      <div className="glass-card p-8 max-w-lg mx-auto text-center animate-fade-in">
        <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-bold text-foreground mb-2">Link Not Found</h2>
        <p className="text-sm text-muted-foreground mb-6">
          This payment link doesn't exist or has been removed.
        </p>
        <Link to="/">
          <Button className="bg-primary text-primary-foreground hover:bg-emerald-glow">
            Create New Link
          </Button>
        </Link>
      </div>
    );
  }

  const isEscrow = link.type === "escrow";
  const isRecurring = link.type === "recurring";
  const isActive = link.status === "active";
  const isFinal = ["completed", "released", "refunded", "expired"].includes(link.status);
  const isAppealed = link.status === "appealed";
  const canPayerRefund = isEscrow && link.status === "funded" && isEscrowTimedOut(link);

  return (
    <div className="max-w-lg mx-auto animate-fade-in space-y-4">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Dashboard
      </Link>

      {/* Header Card */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              {isEscrow ? (
                <Shield className="h-5 w-5 text-primary" />
              ) : isRecurring ? (
                <Repeat className="h-5 w-5 text-primary" />
              ) : (
                <Send className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {isEscrow
                  ? "Escrow Payment"
                  : isRecurring
                  ? "Recurring Payment Link"
                  : "Payment Request"}
              </h2>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground font-mono">ID: {link.id}</p>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${getTypeColor(
                    link.type
                  )}`}
                >
                  {getTypeLabel(link.type).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${getStatusColor(
              link.status
            )}`}
          >
            {getStatusLabel(link.status)}
          </span>
        </div>

        {/* Amount */}
        <div className="text-center py-6 border-y border-border">
          {link.allowCustomAmount ? (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Custom Amount</p>
              <p className="text-2xl font-bold text-foreground">
                Any <span className="text-primary">{TOKEN_LABELS[link.tokenType]}</span>
              </p>
            </div>
          ) : (
            <p className="text-3xl font-bold text-foreground">
              {link.amount}{" "}
              <span className="text-primary">{TOKEN_LABELS[link.tokenType]}</span>
            </p>
          )}
          {link.memo && (
            <p className="text-sm text-muted-foreground mt-2">"{link.memo}"</p>
          )}
        </div>

        {/* Your Role Badge */}
        {isEscrow && walletAddress && role !== "none" && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              Your role:
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                role === "payer"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              }`}
            >
              {role === "payer" ? "Payer / Funder" : "Recipient"}
            </span>
          </div>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 mt-5">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              {isEscrow ? "Payer (Creator)" : "Recipient"}
            </p>
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-xs text-foreground">
                {shortenAddress(isEscrow ? link.creator : link.recipient)}
              </p>
              <button
                onClick={() => {
                  safeClipboardWrite(isEscrow ? link.creator : link.recipient);
                  toast({ title: "Copied" });
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              {isEscrow ? "Recipient" : "Created by"}
            </p>
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-xs text-foreground">
                {shortenAddress(isEscrow ? link.recipient : link.creator)}
              </p>
              <button
                onClick={() => {
                  safeClipboardWrite(isEscrow ? link.recipient : link.creator);
                  toast({ title: "Copied" });
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              Expiry
            </p>
            <div className="flex items-center gap-1.5">
              {link.expiresAt ? (
                <>
                  <CalendarClock className="h-3 w-3 text-muted-foreground" />
                  <p className="text-xs text-foreground">
                    {expiryCountdown || getExpiryLabel(link.expiresAt)}
                  </p>
                </>
              ) : (
                <>
                  <InfinityIcon className="h-3 w-3 text-primary" />
                  <p className="text-xs text-primary font-medium">Never</p>
                </>
              )}
            </div>
          </div>
          {isRecurring && (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                Payments received
              </p>
              <div className="flex items-center gap-1.5">
                <Hash className="h-3 w-3 text-muted-foreground" />
                <p className="text-xs text-foreground font-semibold">
                  {link.payments?.length || 0} ({link.totalReceived || 0}{" "}
                  {TOKEN_LABELS[link.tokenType]})
                </p>
              </div>
            </div>
          )}
          {isEscrow && link.timeoutSeconds && (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                Timeout
              </p>
              <p className="text-xs text-foreground">
                {link.timeoutSeconds >= 86400
                  ? `${link.timeoutSeconds / 86400} days`
                  : link.timeoutSeconds >= 3600
                  ? `${link.timeoutSeconds / 3600} hours`
                  : `${link.timeoutSeconds / 60} minutes`}
              </p>
            </div>
          )}
          {isEscrow && link.claimableBalanceId && (
            <div className="space-y-1 col-span-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                Claimable Balance
              </p>
              <a
                href={explorerClaimableBalanceUrl(link.claimableBalanceId)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:text-emerald-glow font-mono"
              >
                {shortenAddress(link.claimableBalanceId, 8)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          {isEscrow && link.appealedAt && (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                Appealed by
              </p>
              <p className="font-mono text-xs text-orange-400">
                {shortenAddress(link.appealedBy || "")}
              </p>
            </div>
          )}
        </div>

        {/* Escrow Countdown */}
        {isEscrow &&
          link.status === "funded" &&
          countdown !== null &&
          link.timeoutSeconds && (
            <div className="mt-5 p-4 rounded-lg bg-secondary border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Auto-refund window
                  </span>
                </div>
                <span className="font-mono text-sm font-bold text-foreground">
                  {countdown > 0 ? formatCountdown(countdown) : "Refund eligible"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                {countdown > 0
                  ? "After this window, the payer can claim the balance back."
                  : "The payer can now claim the balance back to themselves."}
              </p>
            </div>
          )}

        {/* Transaction info */}
        {(txSig || link.txSignature) && (
          <div className="mt-4 p-3 rounded-lg bg-secondary/50 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Last Transaction</span>
              <a
                href={explorerTxUrl(txSig || link.txSignature || "")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:text-emerald-glow"
              >
                {shortenAddress(txSig || link.txSignature || "", 6)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Escrow Explainer */}
      {isEscrow && !isFinal && <EscrowExplainer role={role} status={link.status} />}

      {/* Actions Card */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Actions</h3>

        {!publicKey && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary border border-border">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Connect your Stellar wallet (Freighter) to interact with this payment link.
            </p>
          </div>
        )}

        {/* ---- ONE-TIME / RECURRING PAY ---- */}
        {publicKey && !isEscrow && isActive && (
          <div className="space-y-3">
            {walletAddress === link.recipient ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                  <Send className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Share this link to get paid!</p>
                  <p className="text-xs text-muted-foreground">
                    You are the recipient on this link. Share it with anyone who should pay you.
                  </p>
                </div>
                <button
                  onClick={() => {
                    safeClipboardWrite(link.linkUrl);
                    toast({ title: "Link copied to clipboard" });
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/15 transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  Copy Payment Link
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {isRecurring
                    ? `This is a recurring payment link. Pay ${
                        link.allowCustomAmount
                          ? "any amount"
                          : `${link.amount} ${TOKEN_LABELS[link.tokenType]}`
                      } directly to the recipient.`
                    : `Pay ${link.amount} ${TOKEN_LABELS[link.tokenType]} directly to the recipient.`}
                </p>
                {link.allowCustomAmount && isRecurring && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground font-medium">Enter amount</p>
                    <Input
                      type="number"
                      step="0.0000001"
                      min="0"
                      placeholder={`Amount in ${TOKEN_LABELS[link.tokenType]}`}
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="bg-secondary border-border text-foreground placeholder:text-muted-foreground text-sm"
                    />
                  </div>
                )}
                <Button
                  onClick={handleDirectPay}
                  disabled={actionLoading}
                  className="w-full bg-primary text-primary-foreground hover:bg-emerald-glow font-semibold h-11"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Pay{" "}
                  {link.allowCustomAmount
                    ? customAmount
                      ? `${customAmount} ${TOKEN_LABELS[link.tokenType]}`
                      : TOKEN_LABELS[link.tokenType]
                    : `${link.amount} ${TOKEN_LABELS[link.tokenType]}`}
                </Button>
              </>
            )}
          </div>
        )}

        {/* ---- ESCROW: PENDING (not yet funded) ---- */}
        {publicKey && isEscrow && link.status === "pending" && (
          <div className="space-y-3">
            {role === "payer" ? (
              <>
                <p className="text-xs text-muted-foreground">
                  You created this escrow. Fund it to lock the funds on-chain as a Stellar claimable balance.
                </p>
                <Button
                  onClick={handleFundEscrow}
                  disabled={actionLoading}
                  className="w-full bg-primary text-primary-foreground hover:bg-emerald-glow font-semibold h-11"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                  )}
                  Fund Escrow ({link.amount} {TOKEN_LABELS[link.tokenType]})
                </Button>
              </>
            ) : (
              <div className="p-3 rounded-lg bg-secondary border border-border">
                <p className="text-xs text-muted-foreground">
                  Waiting for the payer ({shortenAddress(link.creator)}) to fund this escrow. Only the payer can deposit funds.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---- ESCROW: FUNDED -- role-based actions ---- */}
        {publicKey && isEscrow && link.status === "funded" && (
          <div className="space-y-3">
            {role === "recipient" && (
              <>
                <Button
                  onClick={handleReleaseEscrow}
                  disabled={actionLoading || !link.claimableBalanceId}
                  className="w-full bg-primary text-primary-foreground hover:bg-emerald-glow font-semibold h-11"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Claim Funds
                </Button>
                <Button
                  onClick={handleAppealEscrow}
                  disabled={actionLoading}
                  variant="outline"
                  className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10 font-semibold h-10 text-xs"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-2" />
                  File Appeal (Suspend Escrow)
                </Button>
              </>
            )}

            {role === "payer" && (
              <>
                {canPayerRefund ? (
                  <Button
                    onClick={handleRefundEscrow}
                    disabled={actionLoading || !link.claimableBalanceId}
                    variant="outline"
                    className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 font-semibold h-11"
                  >
                    {actionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Undo2 className="h-4 w-4 mr-2" />
                    )}
                    Claim Back (Refund)
                  </Button>
                ) : (
                  <div className="p-3 rounded-lg bg-secondary border border-border">
                    <p className="text-xs text-muted-foreground">
                      <Ban className="h-3 w-3 inline mr-1" />
                      The recipient can claim at any time. You can claim back yourself once the timeout elapses.
                    </p>
                  </div>
                )}
                <Button
                  onClick={handleAppealEscrow}
                  disabled={actionLoading}
                  variant="outline"
                  className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10 font-semibold h-10 text-xs"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-2" />
                  File Appeal (Suspend Escrow)
                </Button>
              </>
            )}

            {role === "none" && (
              <div className="p-3 rounded-lg bg-secondary border border-border">
                <p className="text-xs text-muted-foreground">
                  Only the payer or recipient can interact with this escrow.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---- ESCROW: APPEALED ---- */}
        {publicKey && isEscrow && isAppealed && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
              <AlertTriangle className="h-4 w-4 text-orange-400 flex-shrink-0" />
              <p className="text-xs text-orange-300">
                All actions are suspended in the UI. Contact arbitration before claiming the on-chain balance.
              </p>
            </div>
          </div>
        )}

        {/* ---- FINAL STATES ---- */}
        {isFinal && !isRecurring && (
          <div className="text-center py-4">
            <div className="mb-3">
              {link.status === "completed" || link.status === "released" ? (
                <CheckCircle className="h-8 w-8 text-primary mx-auto" />
              ) : (
                <XCircle className="h-8 w-8 text-destructive mx-auto" />
              )}
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">
              {link.status === "completed"
                ? "Payment Complete"
                : link.status === "released"
                ? "Funds Released"
                : link.status === "expired"
                ? "Link Expired"
                : "Escrow Refunded"}
            </p>
            <p className="text-xs text-muted-foreground">
              {link.status === "completed" || link.status === "released"
                ? `${link.amount} ${TOKEN_LABELS[link.tokenType]} sent to ${shortenAddress(link.recipient)}`
                : link.status === "refunded"
                ? `${link.amount} ${TOKEN_LABELS[link.tokenType]} returned to payer ${shortenAddress(link.creator)}`
                : "This link is no longer accepting payments."}
            </p>
          </div>
        )}

        {isRecurring && link.status === "expired" && (
          <div className="text-center py-4">
            <XCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground mb-1">Link Expired</p>
            <p className="text-xs text-muted-foreground">
              This recurring link has expired. Total received:{" "}
              {link.totalReceived || 0} {TOKEN_LABELS[link.tokenType]} from{" "}
              {link.payments?.length || 0} payments.
            </p>
          </div>
        )}

        {/* Share */}
        {!isFinal && !isAppealed && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Share Link</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowQr(!showQr)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-emerald-glow transition-colors"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  {showQr ? "Hide QR" : "QR Code"}
                </button>
                <button
                  onClick={() => {
                    safeClipboardWrite(link.linkUrl);
                    toast({ title: "Link copied" });
                  }}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-emerald-glow transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              </div>
            </div>
            <AnimatePresence>
              {showQr && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mt-3"
                >
                  <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-secondary/40 border border-border/80 backdrop-blur-md shadow-2xl relative group">
                    <div className="absolute inset-0 bg-primary/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    {/* QR Code Container with sleek dark border and glow */}
                    <div className="relative p-3 bg-white rounded-xl shadow-lg border border-border/50">
                      <QRCodeSVG 
                        value={link.linkUrl} 
                        size={180}
                        fgColor="#0f172a" 
                        bgColor="#ffffff"
                        level="H"
                        includeMargin={false}
                      />
                      {/* Premium Scanner Corner Accents */}
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-primary rounded-tl-sm" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-primary rounded-tr-sm" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-primary rounded-bl-sm" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-primary rounded-br-sm" />
                    </div>

                    <p className="text-xs text-foreground font-semibold mt-4">Point of Sale QR Code</p>
                    <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] text-center">
                      Scan this code with a mobile wallet or camera to pay instantly.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <p className="font-mono text-[11px] text-muted-foreground mt-1 break-all">
              {link.linkUrl}
            </p>
          </div>
        )}
      </div>

      {/* Payment History (Recurring) */}
      {isRecurring && link.payments && link.payments.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Payment History ({link.payments.length})
          </h3>
          <div className="space-y-2">
            {link.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                    <Send className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {p.amount} {TOKEN_LABELS[p.tokenType]}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      From {shortenAddress(p.payer)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <a
                    href={explorerTxUrl(p.txSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:text-emerald-glow"
                  >
                    {shortenAddress(p.txSignature, 4)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(p.paidAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkDetail;
