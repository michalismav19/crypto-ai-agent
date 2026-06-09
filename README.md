# crypto-ai-agent

This is a repo that has a Scheduler (cron / cloud scheduler) that call Crypto market api and call openClaw Agent and return SELL or BUY tags for each crypto that we want and send a notification

## Package script

yarn start # ts-node index.ts (local scheduler + runs immediately)
yarn start:once # single analysis run (good for testing)
yarn build # tsc → dist/ (for production / Lambda)
yarn start:prod # node dist/index.js (after build)

## App Versions

1st version:
Auto run every day, every one hour
Checks from Market Cap API BTC, ETH, XRP and SOL prices and charts
Call OpenClaw Agent to check stats for each crypto and decide if BUY or SELL for each crypto
Send me notification via email or viber

2nd version
Add in code current money that are invested
Add in code current available money to buy Crypto
Add how much of percentage of total spend money on each crypto I want to invest (BTC: 60%, ETH: 25%, XRP: 10%, SOL: 5%)
based on these two, agent will tell me how much ammount can BUY or SELL for each crypto

3rd version
An app that each user can login and add:
Add in code current money that are invested
Add in code current available money to buy Crypto
Add how much of percentage of total spend money on each crypto user want to invest
Send to this user email notification to SELL or BUY and the ammount

## This Project

### What it does

An automated crypto trading signal agent — it fetches live market data, runs technical analysis, feeds everything to Claude AI (Opus), and delivers actionable BUY/SELL/HOLD recommendations via email.

### Architecture (pipeline)

A simple, linear 3-stage pipeline:

#### Data Ingestion — Pulls data from 4 external APIs in parallel (Promise.all):

    - CoinMarketCap — live quotes + 30-day OHLCV candles for BTC, ETH, XRP, SOL
    - Frankfurter API — USD/EUR exchange rate
    - Alternative.me — Crypto Fear & Greed Index
    - CMC Global Metrics — BTC dominance
    - Claude API - Use Claude models

#### Analysis

    - Computes technical indicators locally (RSI, MACD, Bollinger Bands) from the candle data, then sends a structured prompt to Claude - Opus with all market data + portfolio context. Claude produces the analyst report.

#### Notification

    Formats the report as styled HTML and emails it via AWS SES (production) or SMTP/nodemailer (dev).

### Key technical decisions worth mentioning

    - TypeScript end-to-end, deployable as AWS Lambda (via lambda.ts) or locally via ts-node
    - Technical indicators computed server-side (not by the LLM) — RSI(14), MACD(12,26,9), Bollinger Bands(20) — saves ~1,900 input tokens per run and gives the AI verified numbers rather than raw candles
    - Graceful degradation — OHLCV data requires a paid CoinMarketCap plan; if unavailable (402/403), it falls back to quotes-only analysis. Same for FX rate and Fear & Greed.
    - Portfolio-aware prompting — supports both BUY and SELL intent with personalized sizing recommendations based on the user's actual holdings and cash
    - Short-term vs long-term horizons — the prompt adapts which timeframes and indicators to weight
    - CI/CD pipelines

#### Deployment model

    - Production: AWS Lambda + EventBridge Scheduler (cron) + SES for email
    - Local: Interactive CLI that prompts for portfolio details, or run-once.ts for a single analysis

#### Product roadmap (from README)

    Currently at v2 (single-user, portfolio-aware). v3 vision: multi-user with auth, per-user portfolio config, and personalized email notifications.

### What a DoE would care about

    - No tests yet — no unit or integration tests in the repo
    - Single-file services with clear separation of concerns (data fetching, analysis, notification)
    - Cost awareness — token optimization by pre-computing indicators instead of sending raw data to the LLM
    - No database — portfolio is either interactive input or Lambda env vars; v3 would need persistent storage

## AWS Tools Used

| Service | What it does in this project  
| **Lambda** | Runs the analysis code in the cloud — no server to manage. Gets triggered automatically, executes the full pipeline, and shuts down. |
| **EventBridge Scheduler** | The cron job. Triggers the Lambda function on a schedule (e.g. once a day) without any always-on infrastructure. |
| **SES (Simple Email Service)** | Sends the HTML analysis report to your inbox. Used instead of SMTP in production because Lambda has no outbound SMTP; SES handles delivery reliably via IAM. |
| **IAM (Identity & Access Management)** | Controls permissions. The Lambda function uses an IAM role that grants it access to SES — no hardcoded credentials needed inside the function. |
