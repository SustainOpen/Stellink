import { describe, expect, it } from "vitest";
import { USDC_ISSUER } from "./configAddress";
import { getAsset, toStellarAmount } from "./stellar";

describe("getAsset", () => {
  it("returns native XLM for XLM links", () => {
    expect(getAsset("XLM").isNative()).toBe(true);
  });

  it("returns the configured issued USDC asset for USDC links", () => {
    const asset = getAsset("USDC");

    expect(asset.isNative()).toBe(false);
    expect(asset.getCode()).toBe("USDC");
    expect(asset.getIssuer()).toBe(USDC_ISSUER);
  });
});

describe("toStellarAmount", () => {
  it("pads whole numbers to Stellar precision", () => {
    expect(toStellarAmount(2)).toBe("2.0000000");
  });

  it("strips precision beyond seven decimal places", () => {
    expect(toStellarAmount(1.123456789)).toBe("1.1234567");
  });
});
