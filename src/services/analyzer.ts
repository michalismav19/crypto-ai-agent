import Anthropic from "@anthropic-ai/sdk";
import type {
  CMCCoinData,
  CMCOHLCVData,
  CryptoMarketData,
  Portfolio,
} from "../types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Technical indicator helpers ──────────────────────────────────────────────

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      ema.push(NaN);
    } else if (i === period - 1) {
      ema.push(values.slice(0, period).reduce((a, b) => a + b, 0) / period);
    } else {
      ema.push(values[i] * k + ema[i - 1] * (1 - k));
    }
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
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

function calcMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) =>
    !isNaN(v) && !isNaN(ema26[i]) ? v - ema26[i] : NaN,
  );
  const validMacd = macdLine.filter((v) => !isNaN(v));
  if (validMacd.length < 9) return { macd: 0, signal: 0, histogram: 0 };
  const signalLine = calcEMA(validMacd, 9);
  const lastMacd = validMacd[validMacd.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  return { macd: lastMacd, signal: lastSignal, histogram: lastMacd - lastSignal };
}

function calcBB(
  closes: number[],
  period = 20,
): { upper: number; middle: number; lower: number; pctB: number } {
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - sma) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = sma + 2 * stdDev;
  const lower = sma - 2 * stdDev;
  const current = closes[closes.length - 1];
  const pctB = upper === lower ? 0.5 : (current - lower) / (upper - lower);
  return { upper, middle: sma, lower, pctB };
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function pct(value: number | null, decimals = 2): string {
  return value != null ? `${value.toFixed(decimals)}%` : "N/A";
}

/**
 * Replace raw 30-row OHLCV table with pre-computed indicators.
 * This saves ~400-500 input tokens per coin while giving Claude
 * verified numbers instead of raw candles to infer from.
 */
function formatIndicators(ohlcv: CMCOHLCVData | null, currentPrice: number): string {
  const candles = ohlcv?.quotes;
  if (!candles || candles.length < 20) {
    return "(Insufficient candle data — base analysis on percentage changes above)";
  }

  const closes = candles.map((c) => c.quote.USD.close);
  const d = currentPrice < 1 ? 5 : currentPrice < 10 ? 4 : 2;
  const fmt = (n: number) => `$${n.toFixed(d)}`;

  const rsi = calcRSI(closes);
  const rsiLabel = rsi > 70 ? "overbought" : rsi < 30 ? "oversold" : "neutral";

  const { macd, signal, histogram } = calcMACD(closes);
  const macdTrend = histogram > 0 ? "bullish" : "bearish";

  const { upper, middle, lower, pctB } = calcBB(closes);
  const bbPos = pctB > 0.8 ? "near upper band" : pctB < 0.2 ? "near lower band" : "mid-range";

  const pricVsSma = ((currentPrice - middle) / middle) * 100;
  const smaRel = pricVsSma >= 0
    ? `+${pricVsSma.toFixed(1)}% above SMA20`
    : `${pricVsSma.toFixed(1)}% below SMA20`;

  return [
    `RSI(14)       : ${rsi.toFixed(1)} (${rsiLabel})`,
    `MACD(12,26,9) : MACD ${macd.toFixed(2)}, Signal ${signal.toFixed(2)}, Hist ${histogram.toFixed(2)} (${macdTrend})`,
    `Bollinger(20) : Upper ${fmt(upper)} | Mid ${fmt(middle)} | Lower ${fmt(lower)} | %B ${pctB.toFixed(2)} (${bbPos})`,
    `SMA20         : ${fmt(middle)} — current price ${smaRel}`,
  ].join("\n");
}

function buildCoinSection(
  symbol: string,
  coinData: CMCCoinData,
  ohlcv: CMCOHLCVData | null,
  eurRate: number,
): string {
  const q = coinData.quote.USD;
  const d = q.price < 1 ? 5 : q.price < 10 ? 4 : 2;
  const priceEur = q.price * eurRate;

  return [
    `=== ${symbol} ===`,
    `Current Price : $${q.price.toFixed(d)} / €${priceEur.toFixed(d)}`,
    `Change 1h     : ${pct(q.percent_change_1h)}`,
    `Change 24h    : ${pct(q.percent_change_24h)}`,
    `Change 7d     : ${pct(q.percent_change_7d)}`,
    `Change 30d    : ${pct(q.percent_change_30d)}`,
    `Change 60d    : ${pct(q.percent_change_60d)}`,
    `Change 90d    : ${pct(q.percent_change_90d)}`,
    `Market Cap    : $${(q.market_cap / 1e9).toFixed(2)}B`,
    `24h Volume    : $${(q.volume_24h / 1e9).toFixed(2)}B`,
    `Vol/MCap Ratio: ${((q.volume_24h / q.market_cap) * 100).toFixed(2)}%`,
    "",
    "Technical Indicators (computed from 30-day daily candles):",
    formatIndicators(ohlcv, q.price),
  ].join("\n");
}

/**
 * Call Claude to produce a full analyst report.
 * Pre-computed indicators replace raw OHLCV tables, saving ~1900 input
 * tokens per run while preserving (and improving) analysis quality.
 */
export async function analyzeMarket(
  { quotes, ohlcvData, eurRate, btcDominance, fearAndGreed }: CryptoMarketData,
  portfolio?: Portfolio,
): Promise<string> {
  const coins = Object.keys(quotes);
  const coinSections = Object.entries(quotes)
    .map(([symbol, coinData]) =>
      buildCoinSection(symbol, coinData, ohlcvData[symbol] ?? null, eurRate),
    )
    .join("\n\n");

  const today = new Date().toISOString().split("T")[0];
  const horizonLabel = portfolio?.horizon === "long" ? "LONG-TERM" : "SHORT-TERM";
  const horizonContext =
    portfolio?.horizon === "long"
      ? `The user is a LONG-TERM investor (weeks to months).
- Weight 30-day, 60-day, and 90-day trends heavily.
- Ignore intraday noise; focus on macro trend, accumulation patterns, and fundamental strength.
- Stop-loss and take-profit targets should reflect multi-week price targets.`
      : `The user is a SHORT-TERM trader (hours to a few days).
- Weight 1-hour and 24-hour price action heavily.
- Focus on momentum, volume confirmation, and short-term support/resistance.
- Stop-loss and take-profit targets should be tight and reflect near-term price action.`;

  let portfolioSection = "";
  if (portfolio) {
    const holdingLines = Object.entries(quotes)
      .map(([symbol, coinData]) => {
        const amount = portfolio.holdings[symbol] ?? 0;
        const priceUsd = coinData.quote.USD.price;
        const valueUsd = amount * priceUsd;
        const valueEur = valueUsd * eurRate;
        return `  ${symbol}: ${amount} units  ($${valueUsd.toFixed(2)} / €${valueEur.toFixed(2)})`;
      })
      .join("\n");

    portfolioSection = `
---

## YOUR PORTFOLIO

Current holdings:
${holdingLines}

Available cash to invest: €${portfolio.availableCash.toFixed(2)}

---

IMPORTANT: The signal for each coin (BUY / SELL / HOLD) must be determined solely by market conditions and technical analysis — NOT by the available budget. The available cash is only context for sizing a BUY if market conditions justify one.

Based on the portfolio above, add a **9. Personalized Action** section for each coin:
- **If BUY signal**: Specify how much of the €${portfolio.availableCash.toFixed(2)} available cash to deploy (in EUR and approximate units at current price). Only deploy cash if the market analysis genuinely supports buying — do not force a BUY just because cash is available.
- **If SELL signal**: Specify how many units of the held amount to sell and their approximate value in EUR.
- **If HOLD signal**: Confirm to hold current position or adjust stop-loss if needed.`;
  }

  const systemPrompt = `You are a senior cryptocurrency analyst with 10+ years of hands-on experience in technical analysis, on-chain metrics, and macro crypto market cycles. You produce clear, direct, actionable reports. Never hedge everything — commit to a signal and back it with evidence.`;

  const userPrompt = `Today's date: ${today}
Investment horizon: **${horizonLabel}**

${horizonContext}

## MARKET CONTEXT
Fear & Greed Index : ${fearAndGreed.value}/100 (${fearAndGreed.classification})
BTC Dominance      : ${btcDominance > 0 ? `${btcDominance.toFixed(1)}%` : "N/A"}

## COIN DATA

${coinSections}
${portfolioSection}
---

For EACH of the ${coins.length} coins (${coins.join(", ")}), provide:

1. **SIGNAL**: BUY 🟢 | SELL 🔴 | HOLD 🟡  (be decisive — pick one, aligned with the ${horizonLabel} horizon)
2. **Timing** ⏰: When exactly to act — choose the most appropriate:
   - BUY NOW / BUY TODAY / BUY TOMORROW / WAIT FOR PULLBACK THEN BUY (specify price level)
   - SELL NOW / SELL TODAY / SELL TOMORROW / WAIT FOR BOUNCE THEN SELL (specify price level)
   - HOLD — monitor until [condition]
   Give a concrete date or price trigger, not just a vague suggestion.
3. **Confidence**: High / Medium / Low
4. **Risk Level**: High / Medium / Low
5. **Key Technical Observations** (${horizonLabel} focus):
   - Trend direction (short-term & mid-term)
   - Momentum (accelerating / decelerating / reversing)
   - Volume analysis (confirming or diverging)
   - Notable support / resistance levels
6. **Reasoning**: 2-4 sentences explaining why you chose this signal and timing for a ${horizonLabel} perspective
7. **Stop-Loss suggestion**: price level to exit if wrong (in USD and EUR, ${horizonLabel} appropriate)
8. **Target / Take-Profit**: price level if signal plays out (in USD and EUR, ${horizonLabel} appropriate)${portfolio ? "\n9. **Personalized Action**: specific buy/sell recommendation based on your portfolio (see above)" : ""}

After the individual coin sections, add a brief **Market Summary** (3-5 sentences) covering:
- Overall market sentiment (reference the Fear & Greed Index and BTC dominance) from a ${horizonLabel} perspective
- Any correlations or divergences between the coins
- Top risk to watch

Format the report clearly with headers. Be direct and actionable.`;

  console.log("[Analyzer] Sending data to Claude (this may take 30-60s)...");
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
