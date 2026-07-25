# Nomad Finance Testnet Loan App Plan

## Goal

Create a Sui testnet web application where lenders offer fixed-term DUSDC loans against hBTC collateral, and hBTC holders can accept those offers. Loans are no-liquidation loans: BTC price movement never triggers liquidation. The lender chooses the principal, duration, interest, and required hBTC collateral up front. If the borrower does not repay `principal + fixed interest` by maturity, the lender can claim all escrowed hBTC collateral.

## Confirmed Decisions

- The Sui Move package is the source of truth for offers, active loans, escrow, repayment, default, and claim state.
- DynamoDB is a read model/cache, not the authority for custody or loan state.
- Price data is used only for lender risk warnings in the UI/API, never for on-chain enforcement.
- Lenders escrow DUSDC when creating offers, so listed loans are funded and actionable.
- Borrower acceptance is atomic: hBTC enters escrow and DUSDC principal transfers to the borrower in the same transaction.
- Repayment is one full DUSDC payment of `principal + fixed interest`; no partial repayment in v1.
- Once maturity passes without full repayment, the lender can claim 100% of the hBTC collateral immediately.
- v1 supports only hBTC collateral and DUSDC principal/repayment.
- Users sign transactions directly in the React app with a Sui wallet adapter. Backend APIs do not hold private keys.
- GitHub Actions deploys AWS infrastructure and frontend/backend code, but Sui Move package publishing is manual at first via local `sui client`.
- AWS CDK manages CloudFront, S3, API Gateway, Lambda, DynamoDB, ACM, and Route53 records.
- Backend indexing uses Inodra event webhooks into an idempotent Lambda ingestion endpoint, with DynamoDB as the read model.
- Reconciliation/backfill is not part of v1, but should remain a TODO.

## Architecture

```text
React + TypeScript
  |
  | wallet-signed transactions
  v
Sui testnet Move package
  | emits events
  v
Inodra event webhooks -> API Gateway webhook endpoint -> TypeScript Lambda -> DynamoDB read tables
  ^
  |
API Gateway + TypeScript Lambdas
  |
  v
React app loan list, offer creation, risk warnings
```

### Domains

- Frontend: `testnet.nomadfinance.io`
- API: `testnet-api.nomadfinance.io`
- Existing Route53 hosted zone: `nomadfinance.io` at `/hostedzone/Z091724633RFYDHQ5WNFL`

## Sui Move Package

### Core Objects

- `LoanRegistry`: shared object that owns global config and offer/loan counters.
- `LoanOffer`: lender-created object containing immutable loan terms and escrowed DUSDC.
- `ActiveLoan`: accepted loan containing borrower, lender, repayment amount, collateral amount, maturity timestamp, and escrowed hBTC.

### Offer Terms

Each offer should include:

- lender address
- DUSDC principal amount
- fixed DUSDC interest amount, or APR basis points plus computed fixed interest
- total due amount
- hBTC collateral amount required
- duration seconds
- expiration timestamp for accepting the offer
- created timestamp
- status: open, cancelled, accepted

Use integer base units for all coin amounts. Do not use floats anywhere in contract, backend, or frontend calculations.

### Entry Functions

- `create_offer(registry, dusdc_coin, principal, interest, collateral_required, duration, expires_at, clock)`
  - Validates supported DUSDC coin type.
  - Splits/escrows the principal.
  - Creates an open `LoanOffer`.
  - Emits `OfferCreated`.

- `cancel_offer(offer, clock)`
  - Only lender can cancel.
  - Only open offers can be cancelled.
  - Returns escrowed DUSDC to lender.
  - Emits `OfferCancelled`.

- `accept_offer(offer, hbtc_coin, clock)`
  - Validates offer is open and not expired.
  - Validates exact or sufficient hBTC collateral amount.
  - Transfers DUSDC principal to borrower.
  - Escrows hBTC collateral.
  - Creates `ActiveLoan` with maturity `now + duration`.
  - Emits `OfferAccepted` and/or `LoanCreated`.

- `repay(loan, dusdc_coin, clock)`
  - Allows borrower to repay any time before default claim.
  - Requires full `principal + interest`.
  - Transfers DUSDC repayment to lender.
  - Returns all hBTC collateral to borrower.
  - Marks loan repaid.
  - Emits `LoanRepaid`.

- `claim_default(loan, clock)`
  - Only lender can call.
  - Requires current time greater than maturity.
  - Transfers all hBTC collateral to lender.
  - Marks loan default-claimed.
  - Emits `CollateralClaimed`.

### Invariants

- Escrowed DUSDC in an open offer can only go to the borrower on accept or back to the lender on cancel.
- Escrowed hBTC in an active loan can only go to the borrower on full repayment or to the lender after maturity.
- No oracle, admin, backend, or price feed can liquidate or alter an active loan.
- Maturity and expiration use Sui `Clock`.
- Loan terms are immutable after offer creation.
- Event schemas are stable and versioned.

## Risk Warnings

Risk warnings are informational only. They should appear when the lender creates an offer and in the borrower-facing loan details.

### Inputs

- hBTC collateral amount
- DUSDC principal amount
- fixed interest amount
- duration
- BTC/USD reference price
- optional DUSDC/USD assumption of 1.0 for testnet display

### Metrics

- Starting LTV: `principal_usd / collateral_usd`
- Collateral buffer: `collateral_usd / total_due_usd`
- Break-even BTC drawdown before lender collateral value falls below total due
- Duration bucket: short, medium, long
- Interest compensation relative to risk

### Suggested Warning Levels

- Low: LTV <= 50% and duration <= 30 days
- Medium: LTV > 50% or duration > 30 days
- High: LTV > 70%, duration > 90 days, or interest is low relative to duration
- Critical: LTV > 85% or collateral value is close to or below total due

The warning copy must be explicit that no liquidation will occur and the lender bears market risk until maturity/default.

## Frontend

### Stack

- React
- TypeScript
- Sui TypeScript SDK
- Sui wallet adapter/dApp Kit
- Vite or Next.js static export. Prefer Vite unless server rendering becomes necessary.

### Main Views

- Borrow view
  - Table/list of open funded loan offers.
  - Columns: principal, collateral required, LTV, interest, total due, duration, maturity if accepted now, lender, risk level, actions.
  - Accept flow with wallet connection, hBTC balance check, transaction preview, and final wallet signature.

- Lend view
  - Create funded offer form.
  - Inputs for DUSDC amount, hBTC collateral required, duration, interest.
  - Live risk warning.
  - Wallet-signed create offer transaction that escrows DUSDC.
  - List of lender's open, active, repaid, and defaulted loans.

- Loan detail view
  - Terms, state, maturity, repayment amount, involved addresses, and transaction actions.
  - Borrower action: repay.
  - Lender action: cancel open offer or claim default after maturity.

### Design Direction

Follow `DESIGN.md`:

- Black and white primary palette with restrained gray surfaces.
- Pill-shaped interactive controls.
- Dense, utilitarian loan tables using the documented data-table style.
- Sentence-case display headings with no letter spacing.
- Avoid decorative gradients and broad color palettes.
- Use high-contrast warning treatment through typography, labels, borders, and concise copy rather than introducing a large semantic color system.

## Backend APIs

### Stack

- TypeScript Lambdas
- API Gateway HTTP API
- DynamoDB
- Inodra event webhooks
- AWS SDK v3
- Sui TypeScript SDK

### Endpoints

- `GET /health`
- `GET /config`
  - Returns Sui network, package ID, registry object ID, hBTC coin type, DUSDC coin type, and API version.
- `GET /offers`
  - Reads indexed open offers from DynamoDB.
  - Supports filters for amount, duration, LTV range, risk level, and lender.
- `GET /loans/{id}`
  - Reads indexed loan details.
- `GET /accounts/{address}/loans`
  - Reads loans where address is borrower or lender.
- `POST /risk-score`
  - Computes informational risk metrics from proposed terms.
- `POST /webhooks/inodra/sui`
  - Receives Inodra Sui event webhooks for protocol Move events.
  - Verifies Inodra HMAC-SHA256 signatures against the raw request body before parsing JSON.
  - Processes events idempotently using `X-Dedupe-Key` or `payload.id`.
  - Upserts `LoanOffers` and `Loans` in DynamoDB.

### DynamoDB Tables

- `LoanOffers`
  - Partition key: `offerId`
  - GSIs: by status, by lender, by risk level.

- `Loans`
  - Partition key: `loanId`
  - GSIs: by borrower, by lender, by status, by maturity bucket.

- `WebhookReceipts`
  - Partition key: `dedupeKey`
  - Stores Inodra webhook receipt metadata, event ID, transaction digest, event sequence, event type, checkpoint, processing status, and received timestamp.
  - Uses conditional writes with `attribute_not_exists(dedupeKey)` to make retries and manual replays safe.

### Inodra Webhook Ingestion

Create one Inodra event webhook per protocol event type and point each webhook at:

```text
https://testnet-api.nomadfinance.io/webhooks/inodra/sui
```

Initial event webhooks:

- `OfferCreated`
- `OfferCancelled`
- `OfferAccepted` or `LoanCreated`
- `LoanRepaid`
- `CollateralClaimed`

The webhook Lambda should:

1. Read the raw request body from API Gateway/Lambda.
2. Read `X-Inodra-Signature`, `X-Inodra-Timestamp`, and `X-Dedupe-Key`.
3. Verify the HMAC-SHA256 signature using the Inodra webhook secret before parsing JSON.
4. Enforce a timestamp tolerance for replay protection.
5. Parse JSON only after signature verification succeeds.
6. Validate `payloadVersion === 1`.
7. Validate `payload.activityType === "package_event"`.
8. Validate `payload.type` is one of the configured Move event types for the deployed package.
9. Create a `WebhookReceipts` record with a conditional write keyed by `X-Dedupe-Key` or `payload.id`.
10. Return `200` immediately for duplicate receipts.
11. Upsert the relevant `LoanOffers` or `Loans` records.
12. Return `2xx` only after the receipt and read-model writes succeed.

Response behavior:

- Invalid signature: return `401`.
- Invalid/misconfigured signed payload: return `400` during testnet so setup errors are visible.
- Duplicate delivery: return `200`.
- DynamoDB or processing failure: return `500` so Inodra retries.

Secret handling:

- Store Inodra webhook secrets in AWS Secrets Manager or SSM Parameter Store.
- Because Inodra generates a unique secret per webhook, store a JSON map keyed by webhook ID/name or event type.
- If Inodra provides a stable webhook identifier header, select the matching secret directly.
- If no stable webhook identifier header is available, try verification against the configured small set of event webhook secrets and accept exactly one match.

TODO:

- Add a reconciliation/backfill job later to query Inodra or Sui events by package/cursor/checkpoint and repair missed records. This is intentionally out of scope for v1.

## AWS CDK

### App Structure

```text
infra/
  bin/app.ts
  lib/frontend-stack.ts
  lib/api-stack.ts
  lib/dns-stack.ts
  lib/config.ts
frontend/
backend/
move/
```

### Frontend Stack

- Private S3 bucket for static assets.
- CloudFront distribution with Origin Access Control.
- ACM certificate in `us-east-1` for `testnet.nomadfinance.io`.
- Route53 alias `A`/`AAAA` records for `testnet.nomadfinance.io`.
- Deployment invalidation after frontend asset upload.

### API Stack

- TypeScript Lambda functions bundled with esbuild.
- API Gateway HTTP API.
- DynamoDB tables.
- Public Inodra webhook endpoint at `POST /webhooks/inodra/sui`.
- Secrets Manager or SSM Parameter Store configuration for Inodra webhook secrets.
- ACM certificate/custom domain for `testnet-api.nomadfinance.io`.
- Route53 alias record for `testnet-api.nomadfinance.io`.
- Least-privilege IAM permissions for DynamoDB, secret reads, and logs.

### Configuration

CDK should accept these values through context or environment:

- `suiNetwork=testnet`
- `suiRpcUrl`
- `suiPackageId`
- `suiRegistryObjectId`
- `hbtcCoinType`
- `dusdcCoinType`
- `inodraWebhookSecretsParameterName` or `inodraWebhookSecretsSecretName`
- `hostedZoneId=Z091724633RFYDHQ5WNFL`
- `hostedZoneName=nomadfinance.io`

## Manual Inodra Webhook Setup Runbook

After the API stack is deployed and the Sui package event types are known:

1. Open the Inodra dashboard.
2. Create one Sui event webhook per protocol event type.
3. Use the full Move event type for each event, including the deployed package ID.
4. Set each webhook URL to `https://testnet-api.nomadfinance.io/webhooks/inodra/sui`.
5. Copy each generated webhook secret.
6. Store the secrets in the configured AWS Secrets Manager secret or SSM parameter as a JSON map.
7. Send test deliveries or trigger testnet transactions and confirm `WebhookReceipts`, `LoanOffers`, and `Loans` update as expected.

The webhook endpoint must remain HTTPS and publicly reachable. Do not use frontend-visible API keys or wallet credentials for webhook authentication.

## Manual Sui Testnet Deployment Runbook

Use the locally configured `sui client` for Move deployment. The AWS pipeline should consume the deployed IDs after this step.

### 1. Confirm CLI and active environment

```bash
sui client active-env
sui client envs
sui client active-address
sui client gas
```

If needed, switch to testnet:

```bash
sui client switch --env testnet
```

If testnet is missing, add it:

```bash
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet
```

### 2. Fund deployer address

Use the Sui testnet faucet for the active address, then confirm gas:

```bash
sui client active-address
sui client gas
```

### 3. Build the Move package

```bash
cd move
sui move build
```

### 4. Publish the package

```bash
sui client publish --gas-budget 100000000
```

Record from the publish output:

- package ID
- upgrade capability object ID
- created shared registry object ID, if initialized during publish

If registry initialization is a separate transaction, run the package's init/create-registry command and record the shared object ID.

### 5. Configure application deployment

Store the published Sui IDs for CDK/GitHub Actions. Preferred approach:

```bash
cd ..
npx cdk deploy \
  -c suiNetwork=testnet \
  -c suiPackageId=<PACKAGE_ID> \
  -c suiRegistryObjectId=<REGISTRY_OBJECT_ID> \
  -c hbtcCoinType=<HBTC_COIN_TYPE> \
  -c dusdcCoinType=<DUSDC_COIN_TYPE>
```

Keep the upgrade capability private. Do not put deployer mnemonics or Sui private keys in GitHub Actions for v1.

## GitHub Actions

Create a deployment workflow that runs on `main` and supports manual dispatch.

Required repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Required repository variable:

- `AWS_REGION`

Recommended additional repository variables:

- `SUI_NETWORK`
- `SUI_RPC_URL`
- `SUI_PACKAGE_ID`
- `SUI_REGISTRY_OBJECT_ID`
- `HBTC_COIN_TYPE`
- `DUSDC_COIN_TYPE`

Pipeline steps:

1. Checkout.
2. Setup Node.js.
3. Install dependencies.
4. Typecheck, lint, and test.
5. Build frontend.
6. Build backend Lambdas.
7. Configure AWS credentials from secrets and `AWS_REGION`.
8. Run `cdk diff` for visibility.
9. Run `cdk deploy --all --require-approval never` with Sui config context.

Do not publish the Sui Move package from GitHub Actions in v1.

## Delivery Milestones

### Milestone 1: Move Protocol

- Implement offer creation, cancellation, acceptance, repayment, and default claim.
- Emit versioned events for every state transition.
- Add Move unit tests for escrow invariants and failure paths.

Acceptance criteria:

- Open offers hold DUSDC escrow.
- Accepted loans transfer DUSDC and hold hBTC escrow atomically.
- Repaid loans return hBTC only after full DUSDC repayment.
- Default claims only work after maturity.

### Milestone 2: Backend Read Model

- Implement DynamoDB tables and Inodra webhook ingestion Lambda.
- Implement API routes for config, offers, loans, account loans, and risk scoring.
- Add HMAC signature verification and idempotent event processing.

Acceptance criteria:

- Inodra webhook deliveries update indexed offers and loans from on-chain Move events.
- Duplicate webhook deliveries do not duplicate or corrupt records.
- Invalid signatures are rejected before payload parsing.
- API returns usable loan lists without requiring the frontend to scan chain state.

### Milestone 3: Frontend

- Implement wallet connection.
- Implement borrow, lend, and loan detail views.
- Implement transaction builders for create offer, cancel offer, accept, repay, and claim default.
- Match `DESIGN.md`.

Acceptance criteria:

- A borrower can discover and accept a funded loan offer.
- A lender can create and cancel an offer.
- Active loans show repayment/default actions only to eligible parties.
- Risk warnings are visible before lender offer creation.

### Milestone 4: CDK Infrastructure

- Implement frontend, API, database, DNS, and certificate resources.
- Wire environment/config into frontend and backend.
- Deploy to `testnet.nomadfinance.io` and `testnet-api.nomadfinance.io`.

Acceptance criteria:

- CloudFront serves the React app over HTTPS.
- API custom domain serves HTTPS routes.
- Route53 records point both subdomains to managed AWS resources.

### Milestone 5: CI/CD

- Add GitHub Actions workflow.
- Use AWS secrets and region variable.
- Deploy CDK stacks after checks pass.

Acceptance criteria:

- A push to `main` can deploy frontend/backend/infrastructure without manual AWS console work.
- Sui package IDs remain explicit configuration inputs.

## Open Inputs Needed Before Implementation

- Exact Sui testnet coin type for Hashi hBTC.
- Exact Sui testnet coin type for DeepBook DUSDC.
- Whether interest should be entered as fixed DUSDC amount or APR basis points in the lender UI. Contract can store fixed total interest either way.
- Preferred BTC/USD price source for testnet risk warnings.
- Whether the deployer will keep CDK config in repository defaults, GitHub variables, or a checked-in non-secret environment file.

## Non-Goals For v1

- Liquidations.
- Oracle-enforced loan state.
- Partial repayments.
- Loan refinancing or extensions.
- Multi-collateral markets.
- Backend custody or backend-submitted user transactions.
- Automated Sui package publishing in CI.
