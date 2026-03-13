import Anthropic from "@anthropic-ai/sdk";
import type {
  CMCCoinData,
  CMCOHLCVData,
  CMCQuotesMap,
  OHLCVMap,
  Portfolio,
} from "../types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
/**
 * Format OHLCV candles into a compact table for the prompt.
 * Returns null when no candle data is available.
 */
function formatOHLCV(ohlcvData: CMCOHLCVData | null): string | null {
  const candles = ohlcvData?.quotes;
  if (!candles || candles.length === 0) return null;

  return candles
    .slice(-30)
    .map((c) => {
      const q = c.quote.USD;
      return (
        `  ${c.time_open.split("T")[0]} | ` +
        `O:${q.open.toFixed(2)} H:${q.high.toFixed(2)} L:${q.low.toFixed(2)} ` +
        `C:${q.close.toFixed(2)} V:${(q.volume / 1e6).toFixed(1)}M`
      );
    })
    .join("\n");
}

/**
 * Format a single number with fallback for null values.
 */
function pct(value: number | null, decimals = 2): string {
  return value != null ? `${value.toFixed(decimals)}%` : "N/A";
}

/**
 * Build the per-coin section of the analyst prompt.
 */
function buildCoinSection(
  symbol: string,
  coinData: CMCCoinData,
  ohlcv: CMCOHLCVData | null,
  eurRate: number,
): string {
  const q = coinData.quote.USD;
  const priceDecimals = symbol === "XRP" ? 4 : 2;
  const priceEur = q.price * eurRate;

  const lines: string[] = [
    `=== ${symbol} ===`,
    `Current Price : $${q.price.toFixed(priceDecimals)} / €${priceEur.toFixed(priceDecimals)}`,
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
  ];

  const ohlcvTable = formatOHLCV(ohlcv);
  if (ohlcvTable) {
    lines.push("30-Day Daily OHLCV (Date | Open High Low Close Volume):");
    lines.push(ohlcvTable);
  } else {
    lines.push(
      "(30-day OHLCV candles not available — base analysis on percentage changes above)",
    );
  }

  return lines.join("\n");
}

/**
 * Call Claude Opus 4.6 with adaptive thinking to produce a full analyst report.
 * Uses streaming to avoid HTTP timeout on long analysis chains.
 */
export async function analyzeMarket(
  quotes: CMCQuotesMap,
  ohlcvData: OHLCVMap,
  eurRate: number,
  portfolio?: Portfolio,
): Promise<string> {
  const coinSections = Object.entries(quotes)
    .map(([symbol, coinData]) =>
      buildCoinSection(symbol, coinData, ohlcvData[symbol] ?? null, eurRate),
    )
    .join("\n\n");
  const today = new Date().toISOString().split("T")[0];

  // Build portfolio context block if provided
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

Based on the signals below and the portfolio above, add an **8. Personalized Action** section for each coin:
- **BUY signal**: Specify exactly how much of the €${portfolio.availableCash.toFixed(2)} available cash to deploy for this coin (in EUR and approximate units at current price). Distribute across all BUY signals proportionally to confidence.
- **SELL signal**: Specify how many units of the held amount to sell and their approximate value in EUR.
- **HOLD signal**: Confirm to hold current position or adjust stop-loss if needed.`;
  }

  const prompt = `You are a senior cryptocurrency analyst with 10+ years of hands-on experience in technical analysis, on-chain metrics, and macro crypto market cycles.

Today's date: ${today}

Analyze the following market data and produce a clear, actionable report for each coin.

${coinSections}
${portfolioSection}
---

For EACH of the four coins (BTC, ETH, XRP, SOL), provide:

1. **SIGNAL**: BUY 🟢 | SELL 🔴 | HOLD 🟡  (be decisive — pick one)
2. **Confidence**: High / Medium / Low
3. **Risk Level**: High / Medium / Low
4. **Key Technical Observations**:
   - Trend direction (short-term & mid-term)
   - Momentum (accelerating / decelerating / reversing)
   - Volume analysis (confirming or diverging)
   - Notable support / resistance levels (infer from price action if no candles)
5. **Reasoning**: 2-4 sentences explaining why you chose this signal
6. **Stop-Loss suggestion**: price level to exit if wrong (in USD and EUR)
7. **Target / Take-Profit**: price level if signal plays out (in USD and EUR)${portfolio ? "\n8. **Personalized Action**: specific buy/sell recommendation based on your portfolio (see above)" : ""}

After the individual coin sections, add a brief **Market Summary** (3-5 sentences) covering:
- Overall market sentiment
- Any correlations or divergences between the four coins
- Top risk to watch

Format the report clearly with headers. Be direct and actionable.`;

  console.log("[Analyzer] Sending data to Claude (this may take 30-60s)...");
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
