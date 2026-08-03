import "dotenv/config";
import * as readline from "readline";
import * as crypto from "crypto";
import { promptPortfolio } from "./src/services/portfolio";
import { createCryptoToolServer } from "./src/agent/tools";
import { getAgentSdk } from "./src/agent/sdk";
import { config } from "./src/config";

/**
 * Interactive chat mode, built on the Claude Agent SDK.
 *
 * Unlike the hourly pipeline (index.ts → scheduler.ts → analyzer.ts), which
 * sends one fixed prompt built from pre-fetched data, this mode gives Claude
 * two tools (get_market_data, get_portfolio) and lets it decide when to call
 * them across a multi-turn conversation. Useful for ad-hoc questions —
 * "how does XRP look this week", "should I rebalance" — that don't fit the
 * fixed hourly report.
 */

const SYSTEM_PROMPT = `You are a senior cryptocurrency analyst with 10+ years of hands-on experience in technical analysis, on-chain metrics, and macro crypto market cycles. You're chatting directly with the user about BTC, ETH, XRP, and SOL. Never hedge everything — commit to a view and back it with evidence.

You have two tools:
- get_market_data: live prices, % changes, market cap, volume, and computed RSI/MACD/Bollinger indicators for BTC/ETH/XRP/SOL. Call this before any claim about current prices or market conditions — never rely on memorized figures.
- get_portfolio: the user's holdings, available cash or sell target, and investment horizon for this session. Call this before giving personalized buy/sell sizing advice.

Keep answers concise and direct unless the user asks for depth.`;

const TOOL_NAMES = [
  "mcp__crypto-tools__get_market_data",
  "mcp__crypto-tools__get_portfolio",
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
          systemPrompt: SYSTEM_PROMPT,
          model: "claude-opus-4-6",
          mcpServers: { "crypto-tools": server },
          tools: TOOL_NAMES,
          allowedTools: TOOL_NAMES,
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
