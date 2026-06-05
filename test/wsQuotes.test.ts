import { describe, expect, it } from "vitest";
import { applyBithumbDepthEntries, bestBidAskFromBook, createDepthBook } from "../src/wsQuotes";

describe("bithumb depth book (legacy orderbookdepth deltas)", () => {
  it("accumulates deltas across messages instead of rebuilding per message", () => {
    const book = createDepthBook();
    // First message: seed several levels on both sides.
    applyBithumbDepthEntries(book, [
      { orderType: "bid", price: "100", quantity: "1" },
      { orderType: "bid", price: "99", quantity: "2" },
      { orderType: "ask", price: "101", quantity: "1" },
      { orderType: "ask", price: "102", quantity: "3" },
    ]);
    expect(bestBidAskFromBook(book)).toEqual({ bid: 100, ask: 101 });

    // Second message touches a single, non-top level. The old per-message rebuild
    // would collapse the book to just this entry and lose the real best bid/ask.
    applyBithumbDepthEntries(book, [{ orderType: "ask", price: "103", quantity: "5" }]);
    expect(bestBidAskFromBook(book)).toEqual({ bid: 100, ask: 101 });
  });

  it("removes a level when quantity is 0 and recomputes the next best", () => {
    const book = createDepthBook();
    applyBithumbDepthEntries(book, [
      { orderType: "bid", price: "100", quantity: "1" },
      { orderType: "bid", price: "99", quantity: "2" },
      { orderType: "ask", price: "101", quantity: "1" },
    ]);
    // The best bid empties out -> next best bid (99) must surface.
    applyBithumbDepthEntries(book, [{ orderType: "bid", price: "100", quantity: "0" }]);
    expect(bestBidAskFromBook(book)).toEqual({ bid: 99, ask: 101 });
  });

  it("returns null until both sides are populated", () => {
    const book = createDepthBook();
    applyBithumbDepthEntries(book, [{ orderType: "bid", price: "100", quantity: "1" }]);
    expect(bestBidAskFromBook(book)).toBeNull();
  });

  it("ignores malformed entries (bad price, unknown side, negative qty)", () => {
    const book = createDepthBook();
    applyBithumbDepthEntries(book, [
      { orderType: "bid", price: "0", quantity: "1" },
      { orderType: "bid", price: "abc", quantity: "1" },
      { orderType: "weird", price: "100", quantity: "1" },
      { orderType: "bid", price: "100", quantity: "-5" },
      { orderType: "ask", price: "101", quantity: "1" },
      { orderType: "bid", price: "100", quantity: "1" },
    ]);
    expect(bestBidAskFromBook(book)).toEqual({ bid: 100, ask: 101 });
  });
});
