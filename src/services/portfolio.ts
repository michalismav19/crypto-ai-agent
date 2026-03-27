import * as readline from 'readline';
import type { Portfolio } from '../types';
import { SYMBOLS } from './coinMarketCap';

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

/**
 * Interactively prompt the user for their intent (BUY/SELL), holdings, cash/target,
 * and investment horizon.
 */
export async function promptPortfolio(): Promise<Portfolio> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n── Crypto AI Agent ──────────────────────────────────────────');

  // ── Step 1: BUY or SELL intent ─────────────────────────────────────────────
  let intent: 'buy' | 'sell' = 'buy';
  while (true) {
    const intentAnswer = await ask(rl, '\n  What would you like to do?\n  [B] BUY  — when is the best time to buy?\n  [S] SELL — when is the best time to sell?\n\n  Your choice (B/S): ');
    const i = intentAnswer.trim().toUpperCase();
    if (i === 'B' || i === 'BUY')  { intent = 'buy';  break; }
    if (i === 'S' || i === 'SELL') { intent = 'sell'; break; }
    console.log('  Please type "B" for Buy or "S" for Sell.');
  }

  // ── Step 2: Current holdings ───────────────────────────────────────────────
  console.log('\n── Your Holdings ────────────────────────────────────────────');
  console.log('Enter your current holdings (press Enter to skip):\n');

  const holdings: Partial<Record<string, number>> = {};
  for (const symbol of SYMBOLS) {
    const answer = await ask(rl, `  ${symbol} amount held: `);
    const val = parseFloat(answer.trim());
    if (!isNaN(val) && val > 0) holdings[symbol] = val;
  }

  // ── Step 3: Cash / target amount based on intent ───────────────────────────
  let availableCash = 0;
  let targetSellAmountEur: number | undefined;

  if (intent === 'buy') {
    const cashAnswer = await ask(rl, '\n  Available cash to invest (EUR): ');
    availableCash = parseFloat(cashAnswer.trim()) || 0;
  } else {
    const targetAnswer = await ask(rl, '\n  How much money do you want to get from selling crypto (EUR): ');
    targetSellAmountEur = parseFloat(targetAnswer.trim()) || 0;
  }

  // ── Step 4: Investment horizon ─────────────────────────────────────────────
  let horizon: 'short' | 'long' = 'short';
  while (true) {
    const horizonAnswer = await ask(rl, '\n  Investment horizon — short or long? (s/l): ');
    const h = horizonAnswer.trim().toLowerCase();
    if (h === 's' || h === 'short') { horizon = 'short'; break; }
    if (h === 'l' || h === 'long')  { horizon = 'long';  break; }
    console.log('  Please type "s" for short term or "l" for long term.');
  }

  rl.close();
  console.log('─────────────────────────────────────────────────────────────\n');

  return { holdings, availableCash, targetSellAmountEur, horizon, intent };
}
