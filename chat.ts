import "dotenv/config";
import * as readline from "readline";
import * as crypto from "crypto";
import { promptPortfolio } from "./src/services/portfolio";
import { createCryptoToolServer } from "./src/agent/tools";
import { getAgentSdk } from "./src/agent/sdk";
import { config } from "./src/config";

type AgentModule = typeof import("@anthropic-ai/claude-agent-sdk");
type AgentOptions = NonNullable<Parameters<AgentModule["query"]>[0]["options"]>;
type McpServers = NonNullable<AgentOptions["mcpServers"]>;

/**
 * Interactive chat mode, built on the Claude Agent SDK.
 *
 * Unlike the hourly pipeline (index.ts → scheduler.ts → analyzer.ts), which
 * sends one fixed prompt built from pre-fetched data, this mode gives Claude
 * tools and lets it decide when to call them across a multi-turn
 * conversation. Useful for ad-hoc questions — "how does XRP look this
 * week", "should I rebalance", "what's trending today" — that don't fit
 * the fixed hourly report.
 *
 * Tool sources:
 *  - crypto-tools (in-process, src/agent/tools.ts): get_market_data /
 *    get_portfolio — reuse the exact same CoinMarketCap fetch + indicator
 *    logic (RSI/MACD/Bollinger) as the hourly email, so BTC/ETH/XRP/SOL
 *    answers stay consistent with the scheduled report.
 *  - cmc (remote MCP, https://mcp.coinmarketcap.com/mcp): CoinMarketCap's
 *    own hosted server. Used only for things crypto-tools doesn't cover —
 *    other coins, news, trending narratives, macro events, global/
 *    derivatives data. Authenticates with the same CMC API key already
 *    used for the REST calls in coinMarketCap.ts, just as a header instead
 *    of a query param. Skipped entirely if that key isn't set.
 */

const CRYPTO_TOOLS_SYSTEM_PROMPT = `You are a senior cryptocurrency analyst with 10+ years of hands-on experience in technical analysis, on-chain metrics, and macro crypto market cycles. You're chatting directly with the user about crypto markets. Never hedge everything — commit to a view and back it with evidence.

You have tools from two sources — always prefer the more specific one:
- get_market_data / get_portfolio (crypto-tools): the source of truth for BTC, ETH, XRP, SOL prices and technical indicators (RSI/MACD/Bollinger), and for the user's own holdings/cash/target/horizon. Always use these for questions about those four coins or the user's portfolio, so answers stay consistent with the hourly email report. Never rely on memorized prices.
- CoinMarketCap MCP tools (get_crypto_quotes_latest, get_crypto_technical_analysis, get_crypto_info, search_cryptos, get_global_metrics_latest, get_global_crypto_derivatives_metrics, trending_crypto_narratives, get_upcoming_macro_events, get_crypto_latest_news, search_crypto_info, get_crypto_marketcap_technical_analysis, get_crypto_metrics): use these for anything crypto-tools doesn't cover — other coins/tokens, news, trending narratives, macro events, or broader market context.

Keep answers concise and direct unless the user asks for depth.`;

const CRYPTO_TOOLS_NAMES = [
  "mcp__crypto-tools__get_market_data",
  "mcp__crypto-tools__get_portfolio",
];

const CMC_MCP_URL = "https://mcp.coinmarketcap.com/mcp";

const CMC_MCP_TOOL_NAMES = [
  "mcp__cmc__get_crypto_quotes_latest",
  "mcp__cmc__search_cryptos",
  "mcp__cmc__get_crypto_info",
  "mcp__cmc__get_crypto_technical_analysis",
  "mcp__cmc__get_crypto_marketcap_technical_analysis",
  "mcp__cmc__get_crypto_metrics",
  "mcp__cmc__get_global_metrics_latest",
  "mcp__cmc__get_global_crypto_derivatives_metrics",
  "mcp__cmc__trending_crypto_narratives",
  "mcp__cmc__get_upcoming_macro_events",
  "mcp__cmc__get_crypto_latest_news",
  "mcp__cmc__search_crypto_info",
];

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  if (!config.anthropicApiKey) {
    console.error("[Chat] ANTHROPIC_API_KEY is not set — add it to your .env file.");
    process.exit(1);
  }

  console.log("\n── Crypto AI Agent — Chat Mode ─────────────────────────────");

  const portfolio = await promptPortfolio();
  const server = await createCryptoToolServer(portfolio);
  const { query } = await getAgentSdk();

  const mcpServers: McpServers = { "crypto-tools": server };
  const toolNames = [...CRYPTO_TOOLS_NAMES];

  if (config.cmcApiKey) {
    mcpServers.cmc = {
      type: "http",
      url: CMC_MCP_URL,
      headers: { "X-CMC-MCP-API-KEY": config.cmcApiKey },
    };
    toolNames.push(...CMC_MCP_TOOL_NAMES);
  } else {
    console.log(
      "[Chat] COIN_MAKRET_CAP_API_KEY not set — CoinMarketCap MCP tools (news, trending, other coins) are disabled.",
    );
  }

  const sessionId = crypto.randomUUID();
  let firstTurn = true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(
    '\nAsk me anything about BTC/ETH/XRP/SOL or your portfolio. Type "exit" to quit.\n',
  );

  while (true) {
    const input = (await ask(rl, "You: ")).trim();
    if (!input) continue;
    if (["exit", "quit"].includes(input.toLowerCase())) break;

    process.stdout.write("\nAgent: ");

    try {
      for await (const message of query({
        prompt: input,
        options: {
          systemPrompt: CRYPTO_TOOLS_SYSTEM_PROMPT,
          model: "claude-opus-4-6",
          mcpServers,
          tools: toolNames,
          allowedTools: toolNames,
          maxTurns: 6,
          ...(firstTurn ? { sessionId } : { resume: sessionId }),
        },
      })) {
        if (message.type === "assistant") {
          for (const block of message.message.content) {
            if (block.type === "text") process.stdout.write(block.text);
          }
        }
        if (message.type === "result" && message.subtype !== "success") {
          console.log(`\n[Agent could not finish: ${message.subtype}]`);
        }
      }
    } catch (err) {
      console.error("\n[Chat] Error during turn:", err instanceof Error ? err.message : err);
    }

    console.log("\n");
    firstTurn = false;
  }

  rl.close();
  console.log("Goodbye.\n");
}

main().catch((err) => {
  console.error("[Chat] Fatal error:", err);
  process.exit(1);
});
