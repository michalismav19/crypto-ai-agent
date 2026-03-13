import cron from "node-cron";
import { getCryptoData } from "./services/coinMarketCap";
import { analyzeMarket } from "./services/analyzer";
import { sendNotification } from "./services/notifier";

const REQUIRED_ENV_VARS = [
  "COIN_MAKRET_CAP_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

const EMAIL_ENV_VARS = [
  "EMAIL_FROM",
  "EMAIL_TO",
  "EMAIL_SMTP_HOST",
  "EMAIL_SMTP_USER",
  "EMAIL_SMTP_PASS",
] as const;

/**
 * Single analysis run: fetch market data → analyze with Claude → send email.
 * Exported so it can be called by Lambda or as a one-off run.
 */
export async function runAnalysis(): Promise<void> {
  const runId = new Date().toISOString();
  console.log(`\n[${runId}] ── Starting crypto analysis run ──`);

  try {
    const { quotes, ohlcvData } = await getCryptoData();
    console.log("[Scheduler] Market data fetched");
    const analysis = await analyzeMarket(quotes, ohlcvData);
    console.log("[Scheduler] Analysis complete");
    console.log("\n── Analysis Result ──\n");
    console.log(analysis);
    console.log("\n─────────────────────\n");

    const emailReady = EMAIL_ENV_VARS.every((k) => !!process.env[k]);
    if (emailReady) {
      await sendNotification(analysis);
    } else {
      console.log(
        "[Notifier] Email env vars not set — skipping email notification.",
      );
    }
    console.log(`[${runId}] ── Run complete ──\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${runId}] ── Run FAILED: ${message}`);
    if (err instanceof Error && "status" in err)
      console.error(`  HTTP status: ${(err as any).status}`);
    if (err instanceof Error && "error" in err)
      console.error(`  API error:`, (err as any).error);
    // Don't rethrow — keep the scheduler alive even if one run fails.
  }
}

/**
 * Validate env vars, start the hourly cron, and run once immediately on boot.
 */
export function startScheduler(): void {
  const missing = REQUIRED_ENV_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `[Scheduler] Missing required env vars: ${missing.join(", ")}`,
    );
    process.exit(1);
  }

  // Fire at minute 0 of every hour, UTC
  cron.schedule("0 * * * *", () => void runAnalysis(), { timezone: "UTC" });
  console.log("[Scheduler] Started — will run every hour at :00 UTC");

  // Run immediately so you don't wait an hour for the first signal
  void runAnalysis();
}
