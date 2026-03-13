import type { Handler } from 'aws-lambda';
import { runAnalysis } from './src/scheduler';

/**
 * AWS Lambda handler.
 *
 * Deploy steps:
 *  1. yarn build  →  produces dist/
 *  2. Zip dist/ + node_modules and upload to Lambda
 *  3. Set Handler to  dist/lambda.handler
 *  4. Add all env vars in Lambda → Configuration → Environment variables
 *  5. Create an EventBridge rule:  rate(1 hour)  pointing to this function
 *
 * Note: dotenv is intentionally NOT imported here — Lambda provides env vars natively.
 * For local testing:  set env vars in shell, then  ts-node -e "require('./lambda').handler({})"
 */
export const handler: Handler = async (_event) => {
  await runAnalysis();
  return { statusCode: 200, body: 'Analysis complete' };
};
