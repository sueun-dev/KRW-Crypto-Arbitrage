import type { Exchange } from "ccxt";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Runs the second leg of a two-leg hedge after the first leg has already filled.
 *
 * If the second leg throws, we deliberately do NOT auto-trade to unwind the first
 * leg: a thrown error from a market order + fill poll is ambiguous (a timeout does
 * not prove the order failed to execute), so blindly reversing could double the
 * exposure. Instead we raise a loud, explicit error naming the position that may
 * now be unhedged, so the operator can reconcile it manually.
 *
 * @param secondLeg - executes the second hedge leg, resolving to its fill amount
 * @param danglingPosition - human description of the leg-1 position left open if leg 2 fails
 * @returns the second leg's fill amount on success
 */
export async function runHedgeSecondLeg(
  secondLeg: () => Promise<number>,
  danglingPosition: string,
): Promise<number> {
  try {
    return await secondLeg();
  } catch (legErr) {
    throw new Error(
      `⚠️ 헤지 2번째 레그 실패 — 미헤지 포지션 가능: ${danglingPosition}. ` +
        `즉시 수동 확인/청산 필요. 원인: ${errMsg(legErr)}`,
    );
  }
}

async function pollFetchOrder(exchange: Exchange, id: string, symbol: string, timeoutMs = 20_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const order = await exchange.fetchOrder(id, symbol);
      if (order && (order.status === "closed" || order.filled)) return order;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(`Timed out waiting for order fill: ${String(lastErr ?? "")}`.trim());
}

function extractFilledAndCost(order: any): { filled: number; cost: number } {
  const filled = Number(order?.filled ?? 0);
  const cost = Number(order?.cost ?? 0);
  return { filled: Number.isFinite(filled) ? filled : 0, cost: Number.isFinite(cost) ? cost : 0 };
}

/**
 * Places a market order, polls until it fills, and returns the filled base amount.
 *
 * Shared by every market-order leg below; the only per-leg differences are the
 * order side, an optional reference price (GateIO spot buys are quote-denominated),
 * and the log/error wording — all passed in via {@link options}. Behaviour is
 * identical to the previous per-function implementations: same precision handling,
 * same `pollFetchOrder` poll, same "produced 0 fill" guard, and the same log lines.
 *
 * @param options.logFill - builds the success log line from `{ filled, cost }`
 * @param options.zeroFillError - message thrown when nothing fills
 * @param options.refPrice - quote price for ccxt; required (> 0) when provided
 * @param options.afterQtyCheck - extra validation run after the qty guard
 */
async function placeMarketOrder(
  exchange: Exchange,
  symbol: string,
  side: "buy" | "sell",
  baseAmount: number,
  options: {
    logFill: (info: { filled: number; cost: number; coin: string }) => string;
    zeroFillError: string;
    coin: string;
    refPrice?: number;
    afterQtyCheck?: () => void;
  },
): Promise<number> {
  const qty = Number((exchange as any).amountToPrecision?.(symbol, baseAmount) ?? baseAmount);
  if (!(qty > 0)) throw new Error("baseAmount must be > 0");
  options.afterQtyCheck?.();

  const order =
    options.refPrice !== undefined
      ? await exchange.createOrder(symbol, "market", side, qty, options.refPrice)
      : await exchange.createOrder(symbol, "market", side, qty);
  const orderId = String((order as any)?.id ?? "");
  const finalOrder = orderId ? await pollFetchOrder(exchange, orderId, symbol) : order;
  const { filled, cost } = extractFilledAndCost(finalOrder);

  console.info(options.logFill({ filled, cost, coin: options.coin }));
  if (!(filled > 0)) throw new Error(options.zeroFillError);
  return filled;
}

export async function bithumbMarketBuyBase(
  bithumb: Exchange,
  symbol: string,
  baseAmount: number,
  coin: string,
): Promise<number> {
  return placeMarketOrder(bithumb, symbol, "buy", baseAmount, {
    coin,
    logFill: ({ filled, cost }) =>
      `✅ BITHUMB Spot Buy: ${filled.toFixed(8)} ${coin} (cost≈₩${Math.round(cost).toLocaleString()})`,
    zeroFillError: "Bithumb market buy produced 0 fill",
  });
}

export async function bithumbMarketSellBase(
  bithumb: Exchange,
  symbol: string,
  baseAmount: number,
  coin: string,
): Promise<number> {
  return placeMarketOrder(bithumb, symbol, "sell", baseAmount, {
    coin,
    logFill: ({ filled, cost }) =>
      `✅ BITHUMB Spot Sell: ${filled.toFixed(8)} ${coin} (proceeds≈₩${Math.round(cost).toLocaleString()})`,
    zeroFillError: "Bithumb market sell produced 0 fill",
  });
}

export async function gateioPerpShort(
  gatePerp: Exchange,
  symbol: string,
  baseAmount: number,
  coin: string,
): Promise<number> {
  return placeMarketOrder(gatePerp, symbol, "sell", baseAmount, {
    coin,
    logFill: ({ filled }) => `✅ GATEIO Perp Short: ${filled.toFixed(8)} ${coin}`,
    zeroFillError: "GateIO perp short produced 0 fill",
  });
}

export async function gateioPerpCover(
  gatePerp: Exchange,
  symbol: string,
  baseAmount: number,
  coin: string,
): Promise<number> {
  return placeMarketOrder(gatePerp, symbol, "buy", baseAmount, {
    coin,
    logFill: ({ filled }) => `✅ GATEIO Perp Cover: ${filled.toFixed(8)} ${coin}`,
    zeroFillError: "GateIO perp cover produced 0 fill",
  });
}

export async function gateioSpotBuy(
  gateSpot: Exchange,
  symbol: string,
  baseAmount: number,
  coin: string,
  refPrice: number,
): Promise<number> {
  // GateIO spot market BUY is quote-denominated: ccxt needs a price (or explicit cost)
  // and spends amount × price as the quote total (createMarketBuyOrderRequiresPrice
  // defaults to true). Without it ccxt throws InvalidOrder before sending the order.
  // The refPrice guard runs after the qty guard to preserve the original error order.
  return placeMarketOrder(gateSpot, symbol, "buy", baseAmount, {
    coin,
    refPrice,
    afterQtyCheck: () => {
      if (!(refPrice > 0)) throw new Error("refPrice must be > 0 for a GateIO spot market buy");
    },
    logFill: ({ filled }) => `✅ GATEIO Spot Buy: ${filled.toFixed(8)} ${coin}`,
    zeroFillError: "GateIO spot buy produced 0 fill",
  });
}

export async function gateioSpotSell(
  gateSpot: Exchange,
  symbol: string,
  baseAmount: number,
  coin: string,
): Promise<number> {
  return placeMarketOrder(gateSpot, symbol, "sell", baseAmount, {
    coin,
    logFill: ({ filled }) => `✅ GATEIO Spot Sell: ${filled.toFixed(8)} ${coin}`,
    zeroFillError: "GateIO spot sell produced 0 fill",
  });
}
