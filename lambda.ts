import type { Handler } from 'aws-lambda';
import { runAnalysis } from './src/scheduler';
import type { Portfolio } from './src/types';

/**
 * AWS Lambda handler — triggered daily by EventBridge Scheduler.
 *
 * Portfolio is configured via Lambda environment variables (no stdin in Lambda):
 *   PORTFOLIO_BTC        — units of BTC held (e.g. "0.5")
 *   PORTFOLIO_ETH        — units of ETH held
 *   PORTFOLIO_XRP        — units of XRP held
 *   PORTFOLIO_SOL        — units of SOL held
 *   PORTFOLIO_CASH_EUR   — available cash to invest in EUR (for BUY intent)
 *   PORTFOLIO_SELL_EUR   — target EUR to raise from selling (for SELL intent)
 *   PORTFOLIO_INTENT     — "buy" or "sell" (defaults to "buy")
 *   PORTFOLIO_HORIZON    — "short" or "long" (defaults to "short")
 *
 * Email env vars (required to receive the report):
 *   EMAIL_FROM, EMAIL_TO, EMAIL_SMTP_HOST, EMAIL_SMTP_USER, EMAIL_SMTP_PASS
 *
 * Note: dotenv is intentionally NOT imported — Lambda provides env vars natively.
 */
function buildPortfolioFromEnv(): Portfolio | undefined {
  const holdings: Partial<Record<string, number>> = {};

  for (const symbol of ['BTC', 'ETH', 'XRP', 'SOL']) {
    const val = parseFloat(process.env[`PORTFOLIO_${symbol}`] ?? '');
    if (!isNaN(val) && val > 0) holdings[symbol] = val;
  }

  const cash = parseFloat(process.env.PORTFOLIO_CASH_EUR ?? '');
  const sellTarget = parseFloat(process.env.PORTFOLIO_SELL_EUR ?? '');
  const intent = process.env.PORTFOLIO_INTENT === 'sell' ? 'sell' : 'buy';
  const horizon = process.env.PORTFOLIO_HORIZON === 'long' ? 'long' : 'short';

  const hasHoldings = Object.keys(holdings).length > 0;
  const hasCash = !isNaN(cash) && cash > 0;
  const hasSellTarget = !isNaN(sellTarget) && sellTarget > 0;

  if (!hasHoldings && !hasCash && !hasSellTarget) return undefined;

  return {
    holdings,
    availableCash: isNaN(cash) ? 0 : cash,
    targetSellAmountEur: hasSellTarget ? sellTarget : undefined,
    horizon,
    intent,
  };
}

export const handler: Handler = async (_event) => {
  const portfolio = buildPortfolioFromEnv();
  await runAnalysis(portfolio);
  return { statusCode: 200, body: 'Analysis complete' };
};
