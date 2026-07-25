# Nomad Finance Testnet Loan App

## Sui Testnet Deployment

- Transaction digest: `FoQWFrMnV6og3kt6GaT7jvqoCME2qje8rqdYracZsr1M`
- Package ID: `0x86f4bd9977438c3da6060e3b17b0966efacd3e3c18b977f736933dcdb9c07142`
- Upgrade capability object ID: `0x18813011c47331457ffda3316e4f8d8e26d8b706af566216ff94e9692d22c183`
- Created shared registry object ID: not initialized during publish

The publish transaction only created the immutable package and the deployer-owned
upgrade capability. Initialize the shared registry in a separate transaction with
`nomad_loans::protocol::init_registry<DUSDC, HBTC>` after the concrete testnet
DUSDC and hBTC coin types are selected.
