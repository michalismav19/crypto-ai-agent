// ─── Named constants ───────────────────────────────────────────────────────────

export const RSI_PERIOD = 14;
export const MACD_FAST = 12;
export const MACD_SLOW = 26;
export const MACD_SIGNAL_PERIOD = 9;
export const BB_PERIOD = 20;
export const BB_STD_MULT = 2;

// ─── Indicator functions ───────────────────────────────────────────────────────

export function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      ema.push(NaN);
      continue;
    }
    if (i === period - 1) {
      ema.push(values.slice(0, period).reduce((a, b) => a + b, 0) / period);
      continue;
    }
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calcRSI(closes: number[], period = RSI_PERIOD): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? -c : 0));
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function calcMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calcEMA(closes, MACD_FAST);
  const ema26 = calcEMA(closes, MACD_SLOW);
  const macdLine = ema12.map((v, i) =>
    !isNaN(v) && !isNaN(ema26[i]) ? v - ema26[i] : NaN,
  );
  const validMacd = macdLine.filter((v) => !isNaN(v));
  if (validMacd.length < MACD_SIGNAL_PERIOD) return { macd: 0, signal: 0, histogram: 0 };
  const signalLine = calcEMA(validMacd, MACD_SIGNAL_PERIOD);
  const lastMacd = validMacd[validMacd.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  return { macd: lastMacd, signal: lastSignal, histogram: lastMacd - lastSignal };
}

export function calcBB(
  closes: number[],
  period = BB_PERIOD,
): { upper: number; middle: number; lower: number; pctB: number } {
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - sma) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = sma + BB_STD_MULT * stdDev;
  const lower = sma - BB_STD_MULT * stdDev;
  const current = closes[closes.length - 1];
  const pctB = upper === lower ? 0.5 : (current - lower) / (upper - lower);
  return { upper, middle: sma, lower, pctB };
}
