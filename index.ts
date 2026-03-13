import 'dotenv/config';
import { promptPortfolio } from './src/services/portfolio';
import { startScheduler } from './src/scheduler';

async function main() {
  const portfolio = await promptPortfolio();
  startScheduler(portfolio);
}

main().catch(console.error);
