import "dotenv/config";
import { promptPortfolio } from "./src/services/portfolio";
import { runAnalysis } from "./src/scheduler";

async function main() {
  const portfolio = await promptPortfolio(); // create portfolio of user with inputs
  await runAnalysis(portfolio); // analysis and results
}

main().catch(console.error);
