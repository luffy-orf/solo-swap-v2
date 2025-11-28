export interface SwapTokenInput {
  mint: string;
  symbol: string;
  decimals: number;
  uiAmount: number;
  valueUsd: number;
  priceUsd: number;
  signature?: string;
  outputAmount?: number;
  outputUsd?: number;
  quoteImprovementPct?: number;
}

  export interface SwapBatchRecord {
    batchId: string;
    wallet: string;
    hashedWallet: string;
    timestamp: number;
    outputToken: {
      mint: string;
      symbol: string;
    };
    liquidationPct: number;
    slippage: number;
    totals: {
      valueUsdIn: number;
      valueUsdOut: number;
    };
    tokensIn: SwapTokenInput[];
    status: 'success' | 'partial';
    quoteImprovementPct?: number;
    chartIndicators: ChartIndicator[];
  }

  export interface ChartIndicator {
    mint: string;
    symbol: string;
    amount: number;
    valueUsd: number;
    timestamp: number;
    signature: string;
    outputToken: string;
    type: 'liquidation' | 'swap';
  }

export interface SwapBatchRecordWithId extends SwapBatchRecord {
  id: string;
  createdAt?: number;
}

export interface HistorySummaryPoint {
  timestamp: number;
  totalValue: number;
}

export interface HistorySummaryResponse {
  points: HistorySummaryPoint[];
  sellIndicators: {
    timestamp: number;
    valueUsd: number;
    token: string;
    outputToken?: string;
    type?: 'liquidation' | 'swap';
  }[];
}

