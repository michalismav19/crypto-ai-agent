// ─── CoinMarketCap API types ──────────────────────────────────────────────────

export interface CMCQuoteUSD {
  price: number;
  percent_change_1h: number | null;
  percent_change_24h: number | null;
  percent_change_7d: number | null;
  percent_change_30d: number | null;
  percent_change_60d: number | null;
  percent_change_90d: number | null;
  market_cap: number;
  volume_24h: number;
  last_updated: string;
}

export interface CMCCoinData {
  id: number;
  name: string;
  symbol: string;
  circulating_supply: number;
  total_supply: number;
  max_supply: number | null;
  quote: { USD: CMCQuoteUSD };
}

/** Map of symbol → coin data returned by /v1/cryptocurrency/quotes/latest */
export type CMCQuotesMap = Record<string, CMCCoinData>;

export interface OHLCVCandleUSD {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  market_cap: number;
}

export interface OHLCVCandle {
  time_open: string;
  time_close: string;
  quote: { USD: OHLCVCandleUSD };
}

export interface CMCOHLCVData {
  id: number;
  name: string;
  symbol: string;
  quotes: OHLCVCandle[];
}

/** Map of symbol → OHLCV data (null when not available on current CMC plan) */
export type OHLCVMap = Record<string, CMCOHLCVData | null>;

// ─── Analysis types ───────────────────────────────────────────────────────────

export type Signal = 'BUY' | 'SELL' | 'HOLD';

export interface CryptoMarketData {
  quotes: CMCQuotesMap;
  ohlcvData: OHLCVMap;
  eurRate: number; // 1 USD = eurRate EUR
}

export interface Portfolio {
  /** symbol → amount held (e.g. { BTC: 0.5, ETH: 2 }) */
  holdings: Partial<Record<string, number>>;
  /** available cash to invest, in EUR */
  availableCash: number;
  /** investment horizon chosen by the user */
  horizon: 'short' | 'long';
}
