import { describe, expect, it } from "vitest";
import { gateioPerpShortQty } from "../src/positions";

function stub(positions: any[]): any {
  return { fetchPositions: async () => positions };
}

describe("gateioPerpShortQty", () => {
  it("returns the short size for an exact base-coin match", async () => {
    const perp = stub([{ symbol: "BTC/USDT:USDT", contracts: 3, contractSize: 1, side: "short" }]);
    expect(await gateioPerpShortQty(perp, "BTC")).toBe(3);
  });

  it("does NOT match a superstring coin (BTC must not match WBTC)", async () => {
    const perp = stub([{ symbol: "WBTC/USDT:USDT", contracts: 5, contractSize: 1, side: "short" }]);
    expect(await gateioPerpShortQty(perp, "BTC")).toBe(0);
  });

  it("skips long positions of the same coin", async () => {
    const perp = stub([{ symbol: "ETH/USDT:USDT", contracts: 4, contractSize: 1, side: "long" }]);
    expect(await gateioPerpShortQty(perp, "ETH")).toBe(0);
  });

  it("aborts on contractSize != 1 to avoid mis-sizing the cover order", async () => {
    const perp = stub([{ symbol: "BTC/USDT:USDT", contracts: 100, contractSize: 0.0001, side: "short" }]);
    await expect(gateioPerpShortQty(perp, "BTC")).rejects.toThrow(/contractSize/);
  });

  it("returns 0 when fetchPositions throws", async () => {
    const perp = { fetchPositions: async () => { throw new Error("network"); } };
    expect(await gateioPerpShortQty(perp as any, "BTC")).toBe(0);
  });

  it("returns 0 when there is no matching position", async () => {
    const perp = stub([{ symbol: "SOL/USDT:USDT", contracts: 2, contractSize: 1, side: "short" }]);
    expect(await gateioPerpShortQty(perp, "BTC")).toBe(0);
  });
});
