# Infrastructure

AWS CDK stacks for the testnet frontend, API, DynamoDB read model, DNS, and certificates.

## Prerequisites

Build the application artifacts before deploying:

```bash
cd ../backend && npm install && npm run build
cd ../frontend && npm install && npm run build
cd ../infra && npm install
```

Deploy with the requested AWS profile:

```bash
AWS_PROFILE=unnatural-selection npm run deploy -- \
  -c suiRegistryObjectId=<REGISTRY_OBJECT_ID> \
  -c collateralCoinType=<COLLATERAL_COIN_TYPE> \
  -c principalCoinType=<PRINCIPAL_COIN_TYPE> \
  -c inodraWebhookSecretsSecretName=<SECRET_NAME>
```

Use `-c inodraWebhookSecretsParameterName=<PARAMETER_NAME>` instead of the secret name if storing the Inodra JSON secret map in SSM Parameter Store.

The frontend certificate stack is in `us-east-1`, as required by CloudFront. The API stack is deployed in the selected AWS region.
