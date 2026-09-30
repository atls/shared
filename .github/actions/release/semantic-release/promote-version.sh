#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_PACKAGE:?RELEASE_PACKAGE is required}"
: "${RELEASE_VERSION:?RELEASE_VERSION is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"

bash "${RELEASE_TOOLS_PATH}/verify-credentials.sh"

YARN_NPM_AUTH_TOKEN="$NPM_TOKEN" \
  YARN_NPM_REGISTRY_SERVER=https://registry.npmjs.org \
  yarn npm info "$RELEASE_PACKAGE@$RELEASE_VERSION" --fields version --json \
  | jq --exit-status --arg expected "$RELEASE_VERSION" '.version == $expected' > /dev/null

if [[ "${RELEASE_GITHUB_PACKAGES:-false}" == true ]]; then
  YARN_NPM_AUTH_TOKEN="$GITHUB_PACKAGES_TOKEN" \
    YARN_NPM_REGISTRY_SERVER=https://npm.pkg.github.com \
    yarn npm info "$RELEASE_PACKAGE@$RELEASE_VERSION" --fields version --json \
    | jq --exit-status --arg expected "$RELEASE_VERSION" '.version == $expected' > /dev/null
fi

release_assets="$(GH_TOKEN="$GITHUB_TOKEN" gh release view "$RELEASE_PACKAGE@$RELEASE_VERSION" \
  --repo "$GITHUB_REPOSITORY" --json isDraft,assets \
  --jq 'if .isDraft then error("Release is still a draft") else .assets[].name end')"

if [[ -n "${RELEASE_ASSET_PATH:-}" ]]; then
  expected_asset="${RELEASE_ASSET_NAME:-${RELEASE_ASSET_PATH##*/}}"
  grep --fixed-strings --line-regexp --quiet -- "$expected_asset" <<< "$release_assets"
fi

YARN_NPM_AUTH_TOKEN="$NPM_TOKEN" \
  YARN_NPM_REGISTRY_SERVER=https://registry.npmjs.org \
  yarn npm tag add "$RELEASE_PACKAGE@$RELEASE_VERSION" latest
