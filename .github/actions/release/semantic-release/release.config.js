import { createRequire } from 'node:module'
const conventionalCommitsConfigPath = createRequire(import.meta.url).resolve(
  'conventional-changelog-conventionalcommits'
)

const prepareCommands = [
  'yarn workspace "$RELEASE_PACKAGE" version <%= nextRelease.version %> --immediate',
  process.env.RELEASE_PREPARE_COMMAND,
  'yarn workspace "$RELEASE_PACKAGE" exec npm pkg set "gitHead=<%= nextRelease.gitHead %>"',
  'yarn workspace "$RELEASE_PACKAGE" pack --out "$RELEASE_TARBALL"',
].filter(Boolean)

const verifyCommands = [
  'npm whoami --registry=https://registry.npmjs.org --userconfig="$RELEASE_TOOLS_PATH/.npmrc" --prefix="$RELEASE_TOOLS_PATH" > /dev/null',
]

const publishCommands = [
  'npm publish "$RELEASE_TARBALL" --registry=https://registry.npmjs.org --userconfig="$RELEASE_TOOLS_PATH/.npmrc" --prefix="$RELEASE_TOOLS_PATH" --access "$RELEASE_ACCESS" --tag latest',
]

if (process.env.RELEASE_GITHUB_PACKAGES === 'true') {
  verifyCommands.push('test -n "$GITHUB_PACKAGES_TOKEN"')
  publishCommands.push(
    'npm publish "$RELEASE_TARBALL" --registry=https://npm.pkg.github.com --userconfig="$RELEASE_TOOLS_PATH/.npmrc" --prefix="$RELEASE_TOOLS_PATH" --access "$RELEASE_ACCESS" --tag latest'
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
