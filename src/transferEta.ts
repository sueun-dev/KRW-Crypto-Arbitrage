import { TransferStatus } from "./models";
import { normalizeChainName } from "./chains";

type TransferEtaEntry = {
  canonicalChain: string;
  bithumbChain: string;
  gateioChain: string;
  receiveLabel: string;
  confirmations: number | null;
  minutes: number | null;
};

const CHAIN_MINUTES: Record<string, number> = {
  TRON: 3,
  BSC: 4,
  ETH: 8,
  ARBITRUM: 4,
  OPTIMISM: 4,
  POLYGON: 4,
  SOL: 2,
  TON: 3,
  APTOS: 2,
};

function bestConfirmations(status: TransferStatus, canonicalChain: string): number | null {
  const info = status.chainInfo ?? [];
  for (const row of info) {
    if (normalizeChainName(row.name) !== canonicalChain) continue;
    if (row.confirmations != null) return row.confirmations;
  }
  return null;
}

export function buildTransferEtaEntries(
  chainPairs: Array<[string, string]>,
  bithumbStatus: TransferStatus,
  gateioStatus: TransferStatus,
  direction: "bithumb_to_gateio" | "gateio_to_bithumb",
): TransferEtaEntry[] {
  const entries: TransferEtaEntry[] = [];
  for (const [bChain, gChain] of chainPairs) {
    const canonical = normalizeChainName(bChain);
    // Confirmations are a property of the *receiving* exchange's deposit policy
    // (how many block confirmations it requires before crediting the deposit),
    // so read from the destination side — matching `receiveLabel` below.
    const confirmations =
      direction === "bithumb_to_gateio" ? bestConfirmations(gateioStatus, canonical) : bestConfirmations(bithumbStatus, canonical);
    const minutes = CHAIN_MINUTES[canonical] ?? null;
    const receiveLabel = direction === "bithumb_to_gateio" ? "GateIO" : "Bithumb";
    entries.push({
      canonicalChain: canonical,
      bithumbChain: bChain,
      gateioChain: gChain,
      receiveLabel,
      confirmations,
      minutes,
    });
  }
  return entries;
}

