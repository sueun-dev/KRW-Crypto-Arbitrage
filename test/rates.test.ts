import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));
vi.mock("../src/http", () => ({ fetchJson: fetchJsonMock }));

import { usdtKrwRate, usdtKrwRateSource, usdtKrwRateLabel } from "../src/rates";

function urlIncludes(calls: unknown[][], needle: string): boolean {
  return calls.some(([u]) => String(u).includes(needle));
}

describe("usdtKrwRate", () => {
  beforeEach(() => {
    fetchJsonMock.mockReset();
    delete process.env.USDT_PREMIUM_SOURCE;
    delete process.env.USDT_KRW_RATE_OVERRIDE;
  });
  afterEach(() => {
    delete process.env.USDT_PREMIUM_SOURCE;
  });

  it("bithumb_usdt uses the orderbook mid of best bid/ask", async () => {
    fetchJsonMock.mockImplementation(async (url: string) => {
      if (url.includes("bithumb")) return { data: { bids: [{ price: "1390" }], asks: [{ price: "1392" }] } };
      throw new Error(`unexpected url ${url}`);
    });
    expect(await usdtKrwRate("bithumb_usdt")).toBeCloseTo(1391);
  });

  it("fx_plus_usdt_premium returns the domestic rate WITHOUT depending on the FX API", async () => {
    fetchJsonMock.mockImplementation(async (url: string) => {
      if (url.includes("er-api.com")) throw new Error("FX API must not be called for this source");
      if (url.includes("bithumb")) return { data: { bids: [{ price: "1400" }], asks: [{ price: "1402" }] } };
      throw new Error(`unexpected url ${url}`);
    });
    const rate = await usdtKrwRate("fx_plus_usdt_premium");
    expect(rate).toBeCloseTo(1401);
    // The FX endpoint must never be hit — it does not affect the returned value.
    expect(urlIncludes(fetchJsonMock.mock.calls, "er-api.com")).toBe(false);
  });

  it("fx_plus_usdt_premium honors USDT_PREMIUM_SOURCE=upbit", async () => {
    process.env.USDT_PREMIUM_SOURCE = "upbit";
    fetchJsonMock.mockImplementation(async (url: string) => {
      if (url.includes("upbit")) return [{ trade_price: 1395 }];
      throw new Error(`unexpected url ${url}`);
    });
    expect(await usdtKrwRate("fx_plus_usdt_premium")).toBeCloseTo(1395);
  });

  it("rejects an unsupported source", () => {
    expect(() => usdtKrwRateSource("dogecoin")).toThrow(/Unsupported USDT\/KRW rate source/);
  });

  it("maps known aliases to canonical labels", () => {
    expect(usdtKrwRateSource("theddari")).toBe("fx_plus_usdt_premium");
    expect(usdtKrwRateLabel("fx")).toBe("USD/KRW FX (USDT≈USD)");
  });
});
