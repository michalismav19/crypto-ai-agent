import { getCryptoData } from "./services/coinMarketCap";
import { analyzeMarket } from "./services/analyzer";
import { sendNotification } from "./services/notifier";
import type { Portfolio } from "./types";

const EMAIL_ENV_VARS = ["EMAIL_FROM", "EMAIL_TO"] as const;

const isProd = process.env.NODE_ENV === "production";

/**
 * Single analysis run: fetch market data → analyze with Claude → send email.
 * Exported so it can be called by Lambda or as a one-off run.
 */
export async function runAnalysis(portfolio?: Portfolio): Promise<void> {
  const runId = new Date().toISOString();
  console.log(`\n[${runId}] ── Starting crypto analysis run ──`);

  try {
    const marketData = await getCryptoData(); // call coinMarketCap API
    console.log("[Scheduler] Market data fetched");
    const analysis = await analyzeMarket(marketData, portfolio); // call Claude API
    console.log("[Scheduler] Analysis complete");
    console.log("\n── Analysis Result ──\n");
    console.log(analysis);
    console.log("\n─────────────────────\n");

    const emailReady = EMAIL_ENV_VARS.every((k) => !!process.env[k]);

    if (!emailReady || !isProd) {
      console.log(
        "[Notifier] Email env vars not set — skipping email notification.",
      );
    }
    if (emailReady && isProd) {
      await sendNotification(analysis); // send email notification
    }
    console.log(`[${runId}] ── Run complete ──\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${runId}] ── Run FAILED: ${message}`);
    if (err instanceof Error && "status" in err)
      console.error(`  HTTP status: ${(err as any).status}`);
    if (err instanceof Error && "error" in err)
      console.error(`  API error:`, (err as any).error);
    // Rethrow so Lambda marks the invocation as failed
    throw err;
  }
}
