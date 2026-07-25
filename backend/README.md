# Backend

TypeScript Lambda handlers for the milestone 2 read model.

## Environment

- `API_VERSION`
- `SUI_NETWORK`
- `SUI_RPC_URL`
- `SUI_PACKAGE_ID`
- `SUI_REGISTRY_OBJECT_ID`
- `HBTC_COIN_TYPE`
- `DUSDC_COIN_TYPE`
- `LOAN_OFFERS_TABLE`
- `LOANS_TABLE`
- `WEBHOOK_RECEIPTS_TABLE`
- `INODRA_WEBHOOK_SECRET`, `INODRA_WEBHOOK_SECRETS_JSON`,
  `INODRA_WEBHOOK_SECRETS_SECRET_NAME`, or `INODRA_WEBHOOK_SECRETS_PARAMETER_NAME`
- `WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`

## DynamoDB Contract

- `LoanOffers`: partition key `offerId`; GSIs `status-index`, `lender-index`, `riskLevel-index`.
- `Loans`: partition key `loanId`; GSIs `borrower-index`, `lender-index`, `status-index`, `maturityBucket-index`.
- `WebhookReceipts`: partition key `dedupeKey`.

Infrastructure creation is handled in milestone 4; this package contains the Lambda code and table access contract.

## Commands

```bash
npm install
npm run typecheck
npm test
```
