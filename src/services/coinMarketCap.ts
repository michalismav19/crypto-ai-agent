import axios, { AxiosError } from 'axios';
import type { CMCQuotesMap, CMCOHLCVData, OHLCVMap, CryptoMarketData, FearAndGreed } from '../types';

const BASE_URL = 'https://pro-api.coinmarketcap.com';

export const SYMBOLS = ['BTC', 'ETH', 'XRP', 'SOL'] as const;
export type CryptoSymbol = (typeof SYMBOLS)[number];

function apiHeaders(): Record<string, string> {
  return { 'X-CMC_PRO_API_KEY': process.env.COIN_MAKRET_CAP_API_KEY ?? '' };
}

/**
 * Fetch latest quotes for BTC, ETH, XRP, SOL.
 * Available on all CoinMarketCap plans (including free).
 */
async function getQuotes(): Promise<CMCQuotesMap> {
  const response = await axios.get<{ data: CMCQuotesMap }>(
    `${BASE_URL}/v1/cryptocurrency/quotes/latest`,
    {
      headers: apiHeaders(),
      params: { symbol: SYMBOLS.join(','), convert: 'USD' },
      timeout: 10_000,
    },
  );
  return response.data.data;
}

/**
 * Fetch 30-day daily OHLCV for a single symbol.
 * Requires Hobbyist plan ($29/mo) or above.
 * Returns null on 402/403 so the service degrades gracefully on free plans.
 */
async function getOHLCV(symbol: CryptoSymbol): Promise<CMCOHLCVData | null> {
  try {
    const response = await axios.get<{ data: CMCOHLCVData }>(
      `${BASE_URL}/v1/cryptocurrency/ohlcv/historical`,
      {
        headers: apiHeaders(),
        params: { symbol, time_period: 'daily', count: 30, convert: 'USD' },
        timeout: 10_000,
      },
    );
    return response.data.data;
  } catch (err) {
    const status = (err as AxiosError).response?.status;
    if (status === 402 || status === 403) {
      console.warn(
        `[CoinMarketCap] OHLCV not available for ${symbol} on current plan (HTTP ${status}). ` +
          'Proceeding with quotes-only data.',
      );
      return null;
    }
    throw err;
  }
}

/**
 * Fetch the current USD → EUR exchange rate from the free Frankfurter API.
 * Falls back to 0.92 if the request fails.
 */
async function getEurRate(): Promise<number> {
  try {
    const res = await axios.get<{ rates: { EUR: number } }>(
      'https://api.frankfurter.app/latest?from=USD&to=EUR',
      { timeout: 5_000 },
    );
    return res.data.rates.EUR;
  } catch {
    console.warn('[FX] Could not fetch EUR rate — falling back to 0.92');
    return 0.92;
  }
}

/**
 * Fetch the Crypto Fear & Greed Index from the free alternative.me API.
 * Falls back to neutral (50) if the request fails.
 */
async function getFearAndGreed(): Promise<FearAndGreed> {
  try {
    const res = await axios.get<{ data: Array<{ value: string; value_classification: string }> }>(
      'https://api.alternative.me/fng/',
      { timeout: 5_000 },
    );
    const entry = res.data.data[0];
    return { value: parseInt(entry.value, 10), classification: entry.value_classification };
  } catch {
    console.warn('[FearAndGreed] Could not fetch index — falling back to neutral');
    return { value: 50, classification: 'Neutral' };
  }
}

/**
 * Fetch BTC market-cap dominance from CMC global metrics.
 * Available on all CMC plans. Falls back to 0 on error.
 */
async function getBtcDominance(): Promise<number> {
  try {
    const res = await axios.get<{ data: { btc_dominance: number } }>(
      `${BASE_URL}/v1/global-metrics/quotes/latest`,
      { headers: apiHeaders(), timeout: 10_000 },
    );
    return res.data.data.btc_dominance;
  } catch {
    console.warn('[CoinMarketCap] Could not fetch BTC dominance — falling back to 0');
    return 0;
  }
}

/**
 * Main data fetch — returns quotes + OHLCV (if available on the current plan),
 * live USD/EUR rate, BTC dominance, and the Fear & Greed Index.
 * All independent requests run in parallel.
 */
export async function getCryptoData(): Promise<CryptoMarketData> {
  console.log('[CoinMarketCap] Fetching market data...');

  const [quotes, ohlcvResults, eurRate, fearAndGreed, btcDominance] = await Promise.all([
    getQuotes(),
    Promise.all(SYMBOLS.map(s => getOHLCV(s))),
    getEurRate(),
    getFearAndGreed(),
    getBtcDominance(),
  ]);

  const ohlcvData: OHLCVMap = Object.fromEntries(
    SYMBOLS.map((s, i) => [s, ohlcvResults[i]]),
  );

  console.log(`[FX] 1 USD = ${eurRate.toFixed(4)} EUR`);
  console.log(`[Market] BTC dominance: ${btcDominance.toFixed(1)}% | Fear & Greed: ${fearAndGreed.value} (${fearAndGreed.classification})`);

  return { quotes, ohlcvData, eurRate, btcDominance, fearAndGreed };
}
