import type { Exchange } from "ccxt";

/**
 * Returns the open GateIO perp SHORT size for a coin.
 *
 * The returned value is consumed by the cover/unwind legs (e.g. `gateioPerpCover`),
 * which pass it to ccxt's gate `createOrder`. The gate driver treats the order
 * `amount` as an integer CONTRACT count (`size = parseInt(amount)`), so this whole
 * pipeline assumes 1 base unit per contract. If a market's `contractSize` is not 1
 * we abort instead of silently mis-sizing a live cover order by that factor.
 */
export async function gateioPerpShortQty(perp: Exchange, coin: string): Promise<number> {
  const coinUpper = coin.toUpperCase();
  let positions: any[] = [];
  try {
    positions = (await (perp as any).fetchPositions?.()) ?? [];
  } catch {
    return 0.0;
  }

  for (const pos of positions) {
    const symbol = String(pos?.symbol ?? "").toUpperCase();
    // Match the exact base coin, not a substring — otherwise coin "BTC" would also
    // match "WBTC/USDT:USDT" or "BTCDOM/..." and return an unrelated position's size.
    const base = symbol.split(/[/:-]/)[0];
    if (base !== coinUpper) continue;

    const contracts = pos?.contracts;
    const size = pos?.size;
    const contractSize = Number(pos?.contractSize ?? 1.0);
    const side = String(pos?.side ?? "").toLowerCase();

    let qty = 0.0;
    if (contracts !== null && contracts !== undefined && contracts !== 0) qty = Math.abs(Number(contracts) * contractSize);
    else if (size !== null && size !== undefined && size !== 0) qty = Math.abs(Number(size));
    else continue;

    if (side && side !== "short") continue;

    if (Math.abs(contractSize - 1) > 1e-9) {
      throw new Error(
        `gateioPerpShortQty: ${coin} 퍼프 contractSize=${contractSize} (≠1). ` +
          `커버/청산 사이징이 "1 contract = 1 base" 를 전제로 하므로 잘못된 주문을 막기 위해 중단합니다. ` +
          `contract↔base 변환 구현이 필요합니다.`,
      );
    }
    return qty;
  }

  return 0.0;
}
