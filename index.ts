import "dotenv/config";
import { promptPortfolio } from "./src/services/portfolio";
import { runAnalysis } from "./src/scheduler";

async function main() {
  const portfolio = await promptPortfolio();
  await runAnalysis(portfolio);
}

main().catch(console.error);
