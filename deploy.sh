#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${AWS_PROFILE:-}" && "${GITHUB_ACTIONS:-}" != "true" ]]; then
  AWS_PROFILE="unnatural-selection"
  export AWS_PROFILE
fi

ENV_FILE="$ROOT_DIR/.env"
DEFAULT_PRINCIPAL_COIN_TYPE="0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC"
DEFAULT_COLLATERAL_COIN_TYPE="0xfcea10cadbb553c4874201584abf68771592678952efd957b2e82c010c7f4360::btc::BTC"
DEFAULT_SUI_PACKAGE_ID="$(awk -F ' = ' '/^published-at = / { gsub(/"/, "", $2); print $2; exit }' "$ROOT_DIR/move/Published.toml")"
SUI_GAS_BUDGET="${SUI_GAS_BUDGET:-100000000}"

install_if_needed() {
  local dir="$1"
  if [[ ! -d "$ROOT_DIR/$dir/node_modules" ]]; then
    echo "Installing $dir dependencies"
    npm --prefix "$ROOT_DIR/$dir" ci
  fi
}

context_value() {
  local name="$1"
  shift
  local previous=""

  for arg in "$@"; do
    if [[ "$previous" == "-c" || "$previous" == "--context" ]]; then
      if [[ "$arg" == "$name="* ]]; then
        echo "${arg#*=}"
        return 0
      fi
    fi

    if [[ "$arg" == "-c" || "$arg" == "--context" ]]; then
      previous="$arg"
    else
      previous=""
    fi
  done
}

append_env_value() {
  local name="$1"
  local value="$2"

  touch "$ENV_FILE"
  if grep -q "^$name=" "$ENV_FILE"; then
    return 0
  fi

  printf '%s=%q\n' "$name" "$value" >> "$ENV_FILE"
}

load_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

init_registry_if_needed() {
  if [[ -n "$SUI_REGISTRY_OBJECT_ID" ]]; then
    return 0
  fi

  echo "Initializing Sui loan registry"
  local call_json
  call_json="$(
    sui client call \
      --package "$SUI_PACKAGE_ID" \
      --module protocol \
      --function init_registry \
      --type-args "$PRINCIPAL_COIN_TYPE" "$COLLATERAL_COIN_TYPE" \
      --gas-budget "$SUI_GAS_BUDGET" \
      --json
  )"

  SUI_REGISTRY_OBJECT_ID="$(
    printf '%s' "$call_json" | node -e '
      const fs = require("node:fs");
      const data = JSON.parse(fs.readFileSync(0, "utf8"));
      const created = data.objectChanges?.find((change) =>
        change.type === "created" &&
        typeof change.objectType === "string" &&
        change.objectType.includes("::protocol::LoanRegistry<")
      );
      if (!created?.objectId) process.exit(1);
      process.stdout.write(created.objectId);
    '
  )"

  append_env_value SUI_REGISTRY_OBJECT_ID "$SUI_REGISTRY_OBJECT_ID"
  echo "Created registry: $SUI_REGISTRY_OBJECT_ID"
}

load_env_file

ENV_SUI_PACKAGE_ID="${SUI_PACKAGE_ID:-}"
ENV_SUI_REGISTRY_OBJECT_ID="${SUI_REGISTRY_OBJECT_ID:-}"
ENV_PRINCIPAL_COIN_TYPE="${PRINCIPAL_COIN_TYPE:-}"
ENV_COLLATERAL_COIN_TYPE="${COLLATERAL_COIN_TYPE:-}"

SUI_PACKAGE_ID="$(context_value suiPackageId "$@" || true)"
SUI_PACKAGE_ID="${SUI_PACKAGE_ID:-${ENV_SUI_PACKAGE_ID:-$DEFAULT_SUI_PACKAGE_ID}}"
SUI_REGISTRY_OBJECT_ID="$(context_value suiRegistryObjectId "$@" || true)"
SUI_REGISTRY_OBJECT_ID="${SUI_REGISTRY_OBJECT_ID:-$ENV_SUI_REGISTRY_OBJECT_ID}"
PRINCIPAL_COIN_TYPE="$(context_value principalCoinType "$@" || true)"
PRINCIPAL_COIN_TYPE="${PRINCIPAL_COIN_TYPE:-${ENV_PRINCIPAL_COIN_TYPE:-$DEFAULT_PRINCIPAL_COIN_TYPE}}"
COLLATERAL_COIN_TYPE="$(context_value collateralCoinType "$@" || true)"
COLLATERAL_COIN_TYPE="${COLLATERAL_COIN_TYPE:-${ENV_COLLATERAL_COIN_TYPE:-$DEFAULT_COLLATERAL_COIN_TYPE}}"

if [[ -n "${AWS_PROFILE:-}" ]]; then
  echo "Using AWS_PROFILE=$AWS_PROFILE"
else
  echo "Using AWS credentials from environment"
fi
echo "Using Sui package: $SUI_PACKAGE_ID"
echo "Using principal coin: $PRINCIPAL_COIN_TYPE"
echo "Using collateral coin: $COLLATERAL_COIN_TYPE"

if [[ -z "$SUI_REGISTRY_OBJECT_ID" && "${GITHUB_ACTIONS:-}" == "true" ]]; then
  echo "SUI_REGISTRY_OBJECT_ID must be set for GitHub Actions deployments"
  exit 1
fi

init_registry_if_needed
echo "Using registry: $SUI_REGISTRY_OBJECT_ID"

install_if_needed backend
install_if_needed frontend
install_if_needed infra

echo "Building backend"
npm --prefix "$ROOT_DIR/backend" run build

echo "Building frontend"
npm --prefix "$ROOT_DIR/frontend" run build

echo "Deploying AWS stacks"
npm --prefix "$ROOT_DIR/infra" run deploy -- \
  -c "suiPackageId=$SUI_PACKAGE_ID" \
  -c "suiRegistryObjectId=$SUI_REGISTRY_OBJECT_ID" \
  -c "principalCoinType=$PRINCIPAL_COIN_TYPE" \
  -c "collateralCoinType=$COLLATERAL_COIN_TYPE" \
  "$@"
