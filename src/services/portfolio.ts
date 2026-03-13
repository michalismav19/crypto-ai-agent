import * as readline from 'readline';
import type { Portfolio } from '../types';
import { SYMBOLS } from './coinMarketCap';

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

/**
 * Interactively prompt the user for their crypto holdings and available cash.
 * Press Enter to skip / leave at 0.
 */
export async function promptPortfolio(): Promise<Portfolio> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n── Portfolio Setup ──────────────────────────────────────────');
  console.log('Enter your current holdings (press Enter to skip):\n');

  const holdings: Partial<Record<string, number>> = {};
  for (const symbol of SYMBOLS) {
    const answer = await ask(rl, `  ${symbol} amount held: `);
    const val = parseFloat(answer.trim());
    if (!isNaN(val) && val > 0) holdings[symbol] = val;
  }

  const cashAnswer = await ask(rl, '\n  Available cash to invest (EUR): ');
  const availableCash = parseFloat(cashAnswer.trim()) || 0;

  rl.close();
  console.log('─────────────────────────────────────────────────────────────\n');

  return { holdings, availableCash };
}
