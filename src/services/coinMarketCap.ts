import axios, { AxiosError } from 'axios';
import type { CMCQuotesMap, CMCOHLCVData, OHLCVMap, CryptoMarketData } from '../types';

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
    );
    return res.data.rates.EUR;
  } catch {
    console.warn('[FX] Could not fetch EUR rate — falling back to 0.92');
    return 0.92;
  }
}

/**
 * Main data fetch — returns quotes + OHLCV (if available on the current plan)
 * plus the live USD/EUR exchange rate.
 */
export async function getCryptoData(): Promise<CryptoMarketData> {
  console.log('[CoinMarketCap] Fetching quotes...');
  const quotes = await getQuotes();

  console.log('[CoinMarketCap] Fetching OHLCV history...');
  const ohlcvData: OHLCVMap = {};
  for (const symbol of SYMBOLS) {
    ohlcvData[symbol] = await getOHLCV(symbol);
  }

  console.log('[FX] Fetching EUR/USD rate...');
  const eurRate = await getEurRate();
  console.log(`[FX] 1 USD = ${eurRate.toFixed(4)} EUR`);

  return { quotes, ohlcvData, eurRate };
}
