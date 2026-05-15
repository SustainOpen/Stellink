import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  getEscrowRole,
  isEscrowTimedOut,
  isValidStellarAddress,
  type PaymentLink,
} from "./types";

const creator = "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR";
const recipient = "GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U";
const payer = "GDWUSKGGFDI4FRXK5EBTRECZSVQSSWJHHJOGH6JWG3AUMFFMQ435DIAG";

function makeLink(overrides: Partial<PaymentLink> = {}): PaymentLink {
  return {
    id: "link-1",
    type: "escrow",
    creator,
    recipient,
    amount: 25,
    allowCustomAmount: false,
    tokenType: "XLM",
    tokenIssuer: null,
    status: "funded",
    memo: "",
    createdAt: new Date(0).toISOString(),
    linkUrl: "https://stellink.example/link-1",
    expiresAt: null,
    payments: [],
    totalReceived: 0,
    claimableBalanceId: "claimable-balance-1",
    nonce: null,
    timeoutSeconds: 60,
    fundedAt: new Date(Date.now() - 61_000).toISOString(),
    releasedAt: null,
    refundedAt: null,
    appealedAt: null,
    appealedBy: null,
    paidAt: null,
    txSignature: null,
    ...overrides,
  };
}

describe("getEscrowRole", () => {
  it("returns none when there is no connected wallet", () => {
    expect(getEscrowRole(makeLink(), null)).toBe("none");
  });

  it("treats a self-recipient creator as the recipient", () => {
    const link = makeLink({ creator, recipient: creator });

    expect(getEscrowRole(link, creator)).toBe("recipient");
    expect(getEscrowRole(link, payer)).toBe("payer");
  });

  it("maps creator, recipient, and unrelated wallets on normal escrows", () => {
    const link = makeLink();

    expect(getEscrowRole(link, creator)).toBe("payer");
    expect(getEscrowRole(link, recipient)).toBe("recipient");
    expect(getEscrowRole(link, payer)).toBe("none");
  });
});

describe("isValidStellarAddress", () => {
  it("accepts syntactically valid Stellar public keys", () => {
    expect(isValidStellarAddress(creator)).toBe(true);
  });

  it("rejects empty and malformed public keys", () => {
    expect(isValidStellarAddress("")).toBe(false);
    expect(isValidStellarAddress("GSHORT")).toBe(false);
    expect(isValidStellarAddress(`${creator}A`)).toBe(false);
  });
});

describe("formatCountdown", () => {
  it("formats day, hour, minute, and second ranges", () => {
    expect(formatCountdown(90_061)).toBe("1d 1h 1m");
    expect(formatCountdown(3_661)).toBe("1h 1m 1s");
    expect(formatCountdown(61)).toBe("1m 1s");
    expect(formatCountdown(12)).toBe("12s");
  });

  it("marks elapsed countdowns as expired", () => {
    expect(formatCountdown(0)).toBe("Expired");
  });
});

describe("isEscrowTimedOut", () => {
  it("returns true for funded escrows past their timeout", () => {
    expect(isEscrowTimedOut(makeLink())).toBe(true);
  });

  it("returns false for funded escrows before their timeout", () => {
    expect(
      isEscrowTimedOut(
        makeLink({ fundedAt: new Date(Date.now() - 10_000).toISOString() })
      )
    ).toBe(false);
  });

  it("returns false for non-escrow links", () => {
    expect(
      isEscrowTimedOut(
        makeLink({
          type: "one-time",
          status: "active",
          claimableBalanceId: null,
          timeoutSeconds: null,
          fundedAt: null,
        })
      )
    ).toBe(false);
  });
});
