# Nomad Finance Testnet Loan App

## Sui Testnet Deployment

- Initial publish transaction digest: `FoQWFrMnV6og3kt6GaT7jvqoCME2qje8rqdYracZsr1M`
- Upgrade transaction digest: `73uzXetH6T2fW4nq1CtGFDnEYgPbvQrf473ovynvX13B`
- Original package ID: `0x86f4bd9977438c3da6060e3b17b0966efacd3e3c18b977f736933dcdb9c07142`
- Current package ID: `0xd236e287e752dd9f1d05f9bd06c3bf44ef0c31d701d0a4b55b6ff2b9d7852c74`
- Upgrade capability object ID: `0x18813011c47331457ffda3316e4f8d8e26d8b706af566216ff94e9692d22c183`
- Shared registry object ID: `0x27acb76482da84ff4254260a188035f17acaa314042b56cae3fee28c1cb67440`

The initial publish transaction only created the immutable package and the
deployer-owned upgrade capability. The registry was initialized later with
`nomad_loans::protocol::init_registry<USDC, hBTC>`.

## App Deployment

Deploy the backend and frontend together with:

```bash
bash ./deploy.sh
```

The script defaults to `AWS_PROFILE=unnatural-selection`, the latest published
Sui package in `move/Published.toml`, Circle Sui Testnet USDC as principal, and
Hashi Sui Testnet hBTC as collateral. If `SUI_REGISTRY_OBJECT_ID` is not present
in `.env`, the script initializes the registry and stores the new object ID.

Override any value by prefixing the command with env vars or passing CDK context:

```bash
AWS_PROFILE=other-profile bash ./deploy.sh \
  -c inodraWebhookSecretsSecretName=<SECRET_NAME>
```
