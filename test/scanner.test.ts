import { describe, expect, it } from "vitest";
import {
  computeContangoOpportunities,
  computeKimchiOpportunities,
  computeNearZeroOpportunities,
  computeReverseOpportunities,
} from "../src/scanner";

const RATE = 1000; // USDT/KRW

describe("scanner premium direction & filtering", () => {
  it("computeKimchiOpportunities flags domestic premium and sorts highest-first", () => {
    const bithumb = {
      AAA: { bid: 105_000, ask: 105_500 }, // +5% kimchi (105000 vs 100000)
      BBB: { bid: 102_000, ask: 102_500 }, // +2% kimchi
      CCC: { bid: 99_000, ask: 99_500 }, //  -1% (discount) -> excluded at threshold 0
    };
    const perp = {
      AAA: { bid: 99.9, ask: 100 },
      BBB: { bid: 99.9, ask: 100 },
      CCC: { bid: 99.9, ask: 100 },
    };
    const out = computeKimchiOpportunities(bithumb, perp, RATE, 0);
    expect(out.map((o) => o.coin)).toEqual(["AAA", "BBB"]);
    expect(out[0]?.premiumPct).toBeCloseTo(5, 5);
    expect(out.every((o) => o.direction === "kimchi")).toBe(true);
  });

  it("computeReverseOpportunities flags discounts (pct <= threshold) sorted most-negative-first", () => {
    const bithumb = {
      AAA: { bid: 97_500, ask: 98_000 }, // ask/perp.bid: (98000-100000)/100000 = -2%
      BBB: { bid: 98_500, ask: 99_000 }, // -1%
      CCC: { bid: 100_500, ask: 101_000 }, // +1% -> excluded
    };
    const perp = {
      AAA: { bid: 100, ask: 100.1 },
      BBB: { bid: 100, ask: 100.1 },
      CCC: { bid: 100, ask: 100.1 },
    };
    const out = computeReverseOpportunities(bithumb, perp, RATE, -0.1);
    expect(out.map((o) => o.coin)).toEqual(["AAA", "BBB"]);
    expect(out[0]?.premiumPct).toBeCloseTo(-2, 5);
    expect(out.every((o) => o.direction === "reverse")).toBe(true);
  });

  it("computeNearZeroOpportunities keeps |pct| within bound, sorted closest-to-zero", () => {
    const bithumb = {
      AAA: { bid: 100_300, ask: 100_300 }, // +0.3%
      BBB: { bid: 99_900, ask: 99_900 }, //  -0.1%
      CCC: { bid: 105_000, ask: 105_000 }, // +5% -> excluded
    };
    const perp = {
      AAA: { bid: 99.95, ask: 100 },
      BBB: { bid: 99.95, ask: 100 },
      CCC: { bid: 99.95, ask: 100 },
    };
    const out = computeNearZeroOpportunities(bithumb, perp, RATE, 0.5);
    expect(out.map((o) => o.coin)).toEqual(["BBB", "AAA"]);
    expect(Math.abs(out[0]!.premiumPct)).toBeLessThanOrEqual(Math.abs(out[1]!.premiumPct));
  });

  it("computeContangoOpportunities flags perp>spot and sorts highest-first", () => {
    const domestic = {
      AAA: { bid: 99_500, ask: 100_000 }, // ask/rate = 100 USD
      BBB: { bid: 99_500, ask: 100_000 },
    };
    const perp = {
      AAA: { bid: 102, ask: 102.1 }, // +2% contango
      BBB: { bid: 100.5, ask: 100.6 }, // +0.5%
    };
    const out = computeContangoOpportunities(domestic, perp, RATE, 0);
    expect(out.map((o) => o.coin)).toEqual(["AAA", "BBB"]);
    expect(out[0]?.premiumPct).toBeCloseTo(2, 5);
    expect(out.every((o) => o.direction === "contango")).toBe(true);
  });

  it("excludes coins with missing or invalid quotes", () => {
    const bithumb = {
      AAA: { bid: 105_000, ask: 105_500 },
      BBB: { bid: 0, ask: 0 }, // invalid
      CCC: { bid: 105_000, ask: 105_500 }, // no perp counterpart
    };
    const perp = {
      AAA: { bid: 99.9, ask: 100 },
      BBB: { bid: 99.9, ask: 100 },
    };
    const out = computeKimchiOpportunities(bithumb, perp, RATE, 0);
    expect(out.map((o) => o.coin)).toEqual(["AAA"]);
  });
});
