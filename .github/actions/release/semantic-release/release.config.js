import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const conventionalCommitsConfigPath = createRequire(import.meta.url).resolve(
  'conventional-changelog-conventionalcommits'
)

const prepareCommands = [
  'yarn workspace "$RELEASE_PACKAGE" version ${nextRelease.version} --immediate',
  process.env.RELEASE_PREPARE_COMMAND,
].filter(Boolean)

const publishCommands = [
  'YARN_NPM_AUTH_TOKEN="$NPM_TOKEN" YARN_NPM_REGISTRY_SERVER=https://registry.npmjs.org YARN_NPM_PUBLISH_REGISTRY=https://registry.npmjs.org yarn workspace "$RELEASE_PACKAGE" npm publish --access "$RELEASE_ACCESS" --tag candidate',
]

if (process.env.RELEASE_GITHUB_PACKAGES === 'true') {
  publishCommands.push(
    'YARN_NPM_AUTH_TOKEN="$GITHUB_PACKAGES_TOKEN" YARN_NPM_REGISTRY_SERVER=https://npm.pkg.github.com YARN_NPM_PUBLISH_REGISTRY=https://npm.pkg.github.com yarn workspace "$RELEASE_PACKAGE" npm publish --access "$RELEASE_ACCESS"'
  )
}

const releaseAsset = { path: process.env.RELEASE_ASSET_PATH }

if (process.env.RELEASE_ASSET_NAME) {
  releaseAsset.name = process.env.RELEASE_ASSET_NAME
}

export default {
  branches: ['master'],
  tagFormat: `${process.env.RELEASE_PACKAGE}@\${version}`,
  plugins: [
    ['@semantic-release/commit-analyzer', { config: conventionalCommitsConfigPath }],
    ['@semantic-release/release-notes-generator', { config: conventionalCommitsConfigPath }],
    [
      '@semantic-release/exec',
      {
        verifyConditionsCmd:
          `bash "${fileURLToPath(new URL('./verify-credentials.sh', import.meta.url))}"`,
        verifyReleaseCmd: 'echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT"',
        prepareCmd: prepareCommands.join(' && '),
        publishCmd: publishCommands.join(' && '),
      },
    ],
    [
      '@semantic-release/github',
      {
        successComment: false,
        failComment: false,
        releasedLabels: false,
        assets: process.env.RELEASE_ASSET_PATH ? [releaseAsset] : [],
      },
    ],
  ],
}
