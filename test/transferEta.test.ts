import { describe, expect, it } from "vitest";
import { buildTransferEtaEntries } from "../src/transferEta";
import type { ChainInfo, TransferStatus } from "../src/models";

function status(exchange: string, chainInfo: ChainInfo[]): TransferStatus {
  return { exchange, coin: "FOO", depositOk: null, withdrawOk: null, chains: [], chainInfo };
}

function chain(name: string, confirmations: number | null): ChainInfo {
  return { name, depositOk: true, withdrawOk: true, confirmations };
}

describe("transfer ETA confirmations source", () => {
  const pairs: Array<[string, string]> = [["TRON", "TRC20"]];

  it("gateio_to_bithumb takes confirmations from the receiver (Bithumb)", () => {
    const bithumb = status("bithumb", [chain("TRON", 20)]);
    const gateio = status("gateio", [chain("TRC20", null)]);
    const entries = buildTransferEtaEntries(pairs, bithumb, gateio, "gateio_to_bithumb");
    expect(entries[0]?.receiveLabel).toBe("Bithumb");
    expect(entries[0]?.confirmations).toBe(20);
  });

  it("bithumb_to_gateio takes confirmations from the receiver (GateIO), not the sender", () => {
    const bithumb = status("bithumb", [chain("TRON", 20)]);
    const gateio = status("gateio", [chain("TRC20", 12)]);
    const entries = buildTransferEtaEntries(pairs, bithumb, gateio, "bithumb_to_gateio");
    expect(entries[0]?.receiveLabel).toBe("GateIO");
    // Must reflect GateIO's policy (12), never Bithumb's (20).
    expect(entries[0]?.confirmations).toBe(12);
  });
});
