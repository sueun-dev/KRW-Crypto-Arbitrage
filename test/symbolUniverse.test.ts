import { describe, expect, it } from "vitest";
import { bybitSpotAndPerpSymbols, okxSpotAndPerpSymbols, gateioSpotAndPerpSymbols } from "../src/symbolUniverse";

function exchange(markets: Record<string, any>): any {
  return { loadMarkets: async () => markets, markets };
}

const SPOT = exchange({
  "BTC/USDT": { spot: true, quote: "USDT", base: "BTC", active: true },
});

// A clean perpetual, a dated/delivery contract flagged as swap, and a dated-suffix symbol.
const PERP = exchange({
  "BTC/USDT:USDT": { swap: true, quote: "USDT", base: "BTC", settle: "USDT", active: true },
  "ETH/USDT:USDT-240329": { swap: true, quote: "USDT", base: "ETH", settle: "USDT", active: true, expiry: 1711670400000 },
  "SOL/USDT:USDT-241227": { swap: true, quote: "USDT", base: "SOL", settle: "USDT", active: true },
});

describe("perp symbol filters exclude dated/delivery contracts", () => {
  it("bybit keeps clean perps, drops dated contracts", async () => {
    const { perp } = await bybitSpotAndPerpSymbols(SPOT, PERP);
    expect(perp).toEqual({ BTC: "BTC/USDT:USDT" });
  });

  it("okx keeps clean perps, drops dated contracts", async () => {
    const { perp } = await okxSpotAndPerpSymbols(SPOT, PERP);
    expect(perp).toEqual({ BTC: "BTC/USDT:USDT" });
  });

  it("gateio keeps clean perps, drops dated contracts", async () => {
    const { perp } = await gateioSpotAndPerpSymbols(SPOT, PERP);
    expect(perp).toEqual({ BTC: "BTC/USDT:USDT" });
  });
});
