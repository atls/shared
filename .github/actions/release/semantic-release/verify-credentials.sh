#!/usr/bin/env bash
set -euo pipefail

: "${NPM_TOKEN:?NPM_TOKEN is required}"

YARN_NPM_AUTH_TOKEN="$NPM_TOKEN" \
  YARN_NPM_REGISTRY_SERVER=https://registry.npmjs.org \
  YARN_NPM_PUBLISH_REGISTRY=https://registry.npmjs.org \
  yarn npm whoami --publish > /dev/null

if [[ "${RELEASE_GITHUB_PACKAGES:-false}" == true ]]; then
  : "${GITHUB_PACKAGES_TOKEN:?GITHUB_PACKAGES_TOKEN is required}"
  GH_TOKEN="$GITHUB_PACKAGES_TOKEN" gh api rate_limit --silent
fi
