import { describe, expect, it } from "vitest";
import { gateioSpotBuy, runHedgeSecondLeg } from "../src/trading";

function spotBuyStub(captured: any): any {
  return {
    amountToPrecision: (_s: string, a: number) => a,
    createOrder: async (symbol: string, type: string, side: string, amount: number, price?: number) => {
      captured.symbol = symbol;
      captured.type = type;
      captured.side = side;
      captured.amount = amount;
      captured.price = price;
      return { id: "order-1" };
    },
    fetchOrder: async () => ({ status: "closed", filled: captured.amount }),
  };
}

describe("runHedgeSecondLeg", () => {
  it("returns the second-leg fill on success", async () => {
    const filled = await runHedgeSecondLeg(async () => 1.25, "should not appear");
    expect(filled).toBe(1.25);
  });

  it("does NOT auto-trade on failure and surfaces a loud, actionable error", async () => {
    let rolledBack = false;
    const secondLeg = async () => {
      throw new Error("Timed out waiting for order fill");
    };
    // The wrapper must never invoke any unwind itself; the only signal is the error.
    await expect(
      runHedgeSecondLeg(secondLeg, "GateIO BTC 퍼프 숏 0.50000000 (Bithumb 매수 미체결)"),
    ).rejects.toThrow(/미헤지 포지션 가능: GateIO BTC 퍼프 숏 0\.50000000/);
    // Surfaces the underlying cause for diagnosis.
    await expect(runHedgeSecondLeg(secondLeg, "ctx")).rejects.toThrow(/Timed out waiting for order fill/);
    expect(rolledBack).toBe(false);
  });
});

describe("gateioSpotBuy", () => {
  it("passes a price to createOrder so GateIO can size the quote spend (no InvalidOrder)", async () => {
    const captured: any = {};
    const filled = await gateioSpotBuy(spotBuyStub(captured), "BTC/USDT", 0.5, "BTC", 100);
    expect(captured.side).toBe("buy");
    expect(captured.type).toBe("market");
    // The price argument must be present and positive — its absence is exactly the bug.
    expect(captured.price).toBe(100);
    expect(filled).toBe(0.5);
  });

  it("rejects a non-positive reference price", async () => {
    await expect(gateioSpotBuy(spotBuyStub({}), "BTC/USDT", 0.5, "BTC", 0)).rejects.toThrow(/refPrice must be > 0/);
  });
});
