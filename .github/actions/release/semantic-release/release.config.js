import { createRequire } from 'node:module'
const conventionalCommitsConfigPath = createRequire(import.meta.url).resolve(
  'conventional-changelog-conventionalcommits'
)

const prepareCommands = [
  'yarn workspace "$RELEASE_PACKAGE" version ${nextRelease.version} --immediate',
  process.env.RELEASE_PREPARE_COMMAND,
].filter(Boolean)

const verifyCommands = [
  'YARN_NPM_AUTH_TOKEN="$NPM_TOKEN" YARN_NPM_REGISTRY_SERVER=https://registry.npmjs.org YARN_NPM_PUBLISH_REGISTRY=https://registry.npmjs.org yarn npm whoami --publish > /dev/null',
]

const publishCommands = [
  'YARN_NPM_AUTH_TOKEN="$NPM_TOKEN" YARN_NPM_REGISTRY_SERVER=https://registry.npmjs.org YARN_NPM_PUBLISH_REGISTRY=https://registry.npmjs.org yarn workspace "$RELEASE_PACKAGE" npm publish --access "$RELEASE_ACCESS" --tag latest',
]

if (process.env.RELEASE_GITHUB_PACKAGES === 'true') {
  verifyCommands.push('test -n "$GITHUB_PACKAGES_TOKEN"')
  publishCommands.push(
    'YARN_NPM_AUTH_TOKEN="$GITHUB_PACKAGES_TOKEN" YARN_NPM_REGISTRY_SERVER=https://npm.pkg.github.com YARN_NPM_PUBLISH_REGISTRY=https://npm.pkg.github.com yarn workspace "$RELEASE_PACKAGE" npm publish --access "$RELEASE_ACCESS" --tag latest'
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
        verifyConditionsCmd: verifyCommands.join(' && '),
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
