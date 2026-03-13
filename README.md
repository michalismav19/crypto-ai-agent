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
