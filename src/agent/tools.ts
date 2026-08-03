import { getAgentSdk } from "./sdk";
import { getCryptoData } from "../services/coinMarketCap";
import { formatIndicators } from "../services/analyzer";
import type { Portfolio } from "../types";

function pct(value: number | null): string {
  return value != null ? `${value.toFixed(2)}%` : "N/A";
}

/**
 * Builds an in-process MCP server exposing two read-only tools the chat
 * agent can call on demand: live market data (with computed indicators)
 * and the user's portfolio for this session. Both wrap existing services —
 * no market logic is duplicated here.
 */
export async function createCryptoToolServer(portfolio: Portfolio) {
  const { tool, createSdkMcpServer } = await getAgentSdk();

  const getMarketData = tool(
    "get_market_data",
    "Fetch live crypto market data (price, % change 1h/24h/7d/30d, market cap, 24h volume) plus computed technical indicators (RSI-14, MACD, Bollinger Bands) for BTC, ETH, XRP, SOL. Also returns the USD/EUR rate, BTC dominance, and the Fear & Greed index. Always call this before making any claim about current prices or market conditions — never rely on memorized figures.",
    {},
    async () => {
      const data = await getCryptoData();

      const coinSections = Object.entries(data.quotes)
        .map(([symbol, coin]) => {
          const q = coin.quote.USD;
          return [
            `=== ${symbol} ===`,
            `Price: $${q.price.toFixed(2)}`,
            `1h: ${pct(q.percent_change_1h)}  24h: ${pct(q.percent_change_24h)}  7d: ${pct(q.percent_change_7d)}  30d: ${pct(q.percent_change_30d)}`,
            `Market Cap: $${(q.market_cap / 1e9).toFixed(2)}B   24h Volume: $${(q.volume_24h / 1e9).toFixed(2)}B`,
            "",
            `Technical Indicators:`,
            formatIndicators(data.ohlcvData[symbol] ?? null, q.price),
          ].join("\n");
        })
        .join("\n\n");

      const text = [
        `Fear & Greed Index: ${data.fearAndGreed.value}/100 (${data.fearAndGreed.classification})`,
        `BTC Dominance: ${data.btcDominance > 0 ? `${data.btcDominance.toFixed(1)}%` : "N/A"}`,
        `USD/EUR rate: ${data.eurRate.toFixed(4)}`,
        "",
        coinSections,
      ].join("\n");

      return { content: [{ type: "text" as const, text }] };
    },
    { annotations: { readOnlyHint: true, openWorldHint: true } },
  );

  const getPortfolio = tool(
    "get_portfolio",
    "Returns the user's current crypto holdings, available cash or sell target, and investment horizon (short/long) for this chat session. Call this before giving any personalized buy/sell sizing advice.",
    {},
    async () => {
      const holdingEntries = Object.entries(portfolio.holdings);
      const holdingLines = holdingEntries.length
        ? holdingEntries.map(([symbol, amount]) => `  ${symbol}: ${amount}`).join("\n")
        : "  (none entered)";

      const text = [
        `Intent: ${portfolio.intent.toUpperCase()}`,
        `Horizon: ${portfolio.horizon}`,
        "Holdings:",
        holdingLines,
        portfolio.intent === "buy"
          ? `Available cash to invest: €${portfolio.availableCash.toFixed(2)}`
          : `Target amount to raise from selling: €${(portfolio.targetSellAmountEur ?? 0).toFixed(2)}`,
      ].join("\n");

      return { content: [{ type: "text" as const, text }] };
    },
    { annotations: { readOnlyHint: true, openWorldHint: false } },
  );

  return createSdkMcpServer({
    name: "crypto-tools",
    version: "1.0.0",
    tools: [getMarketData, getPortfolio],
  });
}
