import Anthropic from "@anthropic-ai/sdk";
import type {
  CMCCoinData,
  CMCOHLCVData,
  CMCQuotesMap,
  CryptoMarketData,
  Portfolio,
} from "../types";
import { config } from "../config";
import { OHLCV_DAY_COUNT } from "./coinMarketCap";
import {
  BB_PERIOD,
  MACD_FAST,
  MACD_SIGNAL_PERIOD,
  MACD_SLOW,
  RSI_PERIOD,
  calcBB,
  calcMACD,
  calcRSI,
} from "./indicators";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT =
  "You are a senior cryptocurrency analyst with 10+ years of hands-on experience in technical analysis, on-chain metrics, and macro crypto market cycles. You produce clear, direct, actionable reports. Never hedge everything — commit to a signal and back it with evidence.";

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
  if (!candles || candles.length < BB_PERIOD) {
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
  const smaRel =
    pricVsSma >= 0
      ? `+${pricVsSma.toFixed(1)}% above SMA${BB_PERIOD}`
      : `${pricVsSma.toFixed(1)}% below SMA${BB_PERIOD}`;

  return [
    `RSI(${RSI_PERIOD})       : ${rsi.toFixed(1)} (${rsiLabel})`,
    `MACD(${MACD_FAST},${MACD_SLOW},${MACD_SIGNAL_PERIOD}) : MACD ${macd.toFixed(2)}, Signal ${signal.toFixed(2)}, Hist ${histogram.toFixed(2)} (${macdTrend})`,
    `Bollinger(${BB_PERIOD}) : Upper ${fmt(upper)} | Mid ${fmt(middle)} | Lower ${fmt(lower)} | %B ${pctB.toFixed(2)} (${bbPos})`,
    `SMA${BB_PERIOD}         : ${fmt(middle)} — current price ${smaRel}`,
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
    `Technical Indicators (computed from ${OHLCV_DAY_COUNT}-day daily candles):`,
    formatIndicators(ohlcv, q.price),
  ].join("\n");
}

// ─── analyzeMarket helpers ────────────────────────────────────────────────────

function buildHorizonContext(horizon: "short" | "long" | undefined): {
  label: string;
  context: string;
} {
  if (horizon === "long") {
    return {
      label: "LONG-TERM",
      context: `The user is a LONG-TERM investor (weeks to months).
- Weight 30-day, 60-day, and 90-day trends heavily.
- Ignore intraday noise; focus on macro trend, accumulation patterns, and fundamental strength.
- Stop-loss and take-profit targets should reflect multi-week price targets.`,
    };
  }
  return {
    label: "SHORT-TERM",
    context: `The user is a SHORT-TERM trader (hours to a few days).
- Weight 1-hour and 24-hour price action heavily.
- Focus on momentum, volume confirmation, and short-term support/resistance.
- Stop-loss and take-profit targets should be tight and reflect near-term price action.`,
  };
}

function buildPortfolioSection(
  portfolio: Portfolio,
  quotes: CMCQuotesMap,
  eurRate: number,
): string {
  const holdingLines = Object.entries(quotes)
    .map(([symbol, coinData]) => {
      const amount = portfolio.holdings[symbol] ?? 0;
      const priceUsd = coinData.quote.USD.price;
      const valueUsd = amount * priceUsd;
      const valueEur = valueUsd * eurRate;
      return `  ${symbol}: ${amount} units  ($${valueUsd.toFixed(2)} / €${valueEur.toFixed(2)})`;
    })
    .join("\n");

  return `
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

function buildUserPrompt(
  { quotes, btcDominance, fearAndGreed }: CryptoMarketData,
  portfolio: Portfolio | undefined,
  coinSections: string,
  label: string,
  horizonContext: string,
  portfolioSection: string,
): string {
  const today = new Date().toISOString().split("T")[0];
  const coins = Object.keys(quotes);

  return `Today's date: ${today}
Investment horizon: **${label}**

${horizonContext}

## MARKET CONTEXT
Fear & Greed Index : ${fearAndGreed.value}/100 (${fearAndGreed.classification})
BTC Dominance      : ${btcDominance > 0 ? `${btcDominance.toFixed(1)}%` : "N/A"}

## COIN DATA

${coinSections}
${portfolioSection}
---

For EACH of the ${coins.length} coins (${coins.join(", ")}), provide:

1. **SIGNAL**: BUY 🟢 | SELL 🔴 | HOLD 🟡  (be decisive — pick one, aligned with the ${label} horizon)
2. **Timing** ⏰: When exactly to act — choose the most appropriate:
   - BUY NOW / BUY TODAY / BUY TOMORROW / WAIT FOR PULLBACK THEN BUY (specify price level)
   - SELL NOW / SELL TODAY / SELL TOMORROW / WAIT FOR BOUNCE THEN SELL (specify price level)
   - HOLD — monitor until [condition]
   Give a concrete date or price trigger, not just a vague suggestion.
3. **Confidence**: High / Medium / Low
4. **Risk Level**: High / Medium / Low
5. **Key Technical Observations** (${label} focus):
   - Trend direction (short-term & mid-term)
   - Momentum (accelerating / decelerating / reversing)
   - Volume analysis (confirming or diverging)
   - Notable support / resistance levels
6. **Reasoning**: 2-4 sentences explaining why you chose this signal and timing for a ${label} perspective
7. **Stop-Loss suggestion**: price level to exit if wrong (in USD and EUR, ${label} appropriate)
8. **Target / Take-Profit**: price level if signal plays out (in USD and EUR, ${label} appropriate)${portfolio ? "\n9. **Personalized Action**: specific buy/sell recommendation based on your portfolio (see above)" : ""}

After the individual coin sections, add a brief **Market Summary** (3-5 sentences) covering:
- Overall market sentiment (reference the Fear & Greed Index and BTC dominance) from a ${label} perspective
- Any correlations or divergences between the coins
- Top risk to watch

Format the report clearly with headers. Be direct and actionable.`;
}

async function callClaude(userPrompt: string): Promise<string> {
  console.log("[Analyzer] Sending data to Claude (this may take 30-60s)...");
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call Claude to produce a full analyst report.
 * Pre-computed indicators replace raw OHLCV tables, saving ~1900 input
 * tokens per run while preserving (and improving) analysis quality.
 */
export async function analyzeMarket(
  marketData: CryptoMarketData,
  portfolio?: Portfolio,
): Promise<string> {
  const { quotes, ohlcvData, eurRate } = marketData;

  const coinSections = Object.entries(quotes)
    .map(([symbol, coinData]) =>
      buildCoinSection(symbol, coinData, ohlcvData[symbol] ?? null, eurRate),
    )
    .join("\n\n");

  const { label, context: horizonContext } = buildHorizonContext(portfolio?.horizon);
  const portfolioSection = portfolio
    ? buildPortfolioSection(portfolio, quotes, eurRate)
    : "";
  const userPrompt = buildUserPrompt(
    marketData,
    portfolio,
    coinSections,
    label,
    horizonContext,
    portfolioSection,
  );

  return callClaude(userPrompt);
}
