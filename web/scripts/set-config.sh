#!/bin/bash

# Writes src/config/config.json from AWS SSM before a build.
# Usage: scripts/set-config.sh [sandbox|prod|localhost]
#
# Every value comes from /lapcat/{env}/*, the only SSM namespace the CI role
# may read. WebStack publishes the web/* parameters; ApiStack publishes api/url.

set -euo pipefail

ENV="${1:-sandbox}"

case $ENV in
  prod)      AWS_ENV=prod;    WEB_ORIGIN="https://lapcat.nakomis.com" ;;
  sandbox)   AWS_ENV=sandbox; WEB_ORIGIN="https://lapcat.sandbox.nakomis.com" ;;
  localhost) AWS_ENV=sandbox; WEB_ORIGIN="http://localhost:3000" ;;
  *)
    echo "Unknown environment: $ENV (expected sandbox, prod or localhost)" >&2
    exit 1
    ;;
esac

# Only set AWS_PROFILE when no credential env vars are present (i.e. local dev).
# In CI, configure-aws-credentials sets AWS_ACCESS_KEY_ID etc. directly and
# AWS_PROFILE would override them with a nonexistent local profile.
if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
  export AWS_PROFILE="nakom.is-$AWS_ENV"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/../src/config/config.json.template"
CONFIG_FILE="$SCRIPT_DIR/../src/config/config.json"

# Prefer the env var (set by configure-aws-credentials in CI); `aws configure
# get region` only reads the config file.
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region || echo eu-west-2)}}"

param() {
  aws ssm get-parameter --region "$REGION" --name "/lapcat/${AWS_ENV}/$1" \
    --query Parameter.Value --output text
}

USER_POOL_ID=$(param web/user-pool-id)
CLIENT_ID=$(param web/client-id)
LOGIN_DOMAIN=$(param web/login-domain)
API_URL=$(param api/url)

cp "$TEMPLATE" "$CONFIG_FILE"

setValue() {
  local placeholder="$1"
  local value="$2"
  echo "Setting $placeholder to $value"
  local tmp
  tmp=$(mktemp)
  sed "s|$placeholder|$value|g" "$CONFIG_FILE" > "$tmp" && mv "$tmp" "$CONFIG_FILE"
}

setValue "<ENV>" "$ENV"
setValue "<REGION>" "$REGION"
setValue "<AUTHORITY>" "https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}"
setValue "<USER_POOL_ID>" "$USER_POOL_ID"
setValue "<USER_POOL_CLIENT_ID>" "$CLIENT_ID"
setValue "<COGNITO_DOMAIN>" "$LOGIN_DOMAIN"
setValue "<REDIRECT_URI>" "${WEB_ORIGIN}/loggedin"
setValue "<LOGOUT_URI>" "${WEB_ORIGIN}/logout"
setValue "<API_URL>" "$API_URL"

if grep -q '<[A-Z_]*>' "$CONFIG_FILE"; then
  echo "Unfilled placeholders remain in $CONFIG_FILE" >&2
  exit 1
fi

echo "Wrote $CONFIG_FILE"
