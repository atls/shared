# Semantic package publication

Shared owns this action, its code and its pinned toolchain. Infrastructure
manages the `publish-semantic.yaml` reusable workflow. Callers provide the public Yarn workspace,
their build command and optional GitHub release asset. The shared policy owns
Conventional Commits analysis, workspace version application, candidate npm
publication, optional GitHub Packages publication and promotion to npm latest.

Shared owns the pinned semantic-release toolchain and npm lockfile. The action
installs it in its own directory without changing the caller's dependency graph.
Project build and publication commands still run through the caller's checked
Yarn runtime. The optional
`dryRun` input passes the native `--dry-run` flag; it does not replace
semantic-release authentication checks or execute its prepare/publish stages.

The existing `publish.yaml` interface is unchanged. Migration of its other
callers is not part of the Raijin integration.

Workflow and infrastructure validation belongs to the repository CI. A local
Git fixture can run the native semantic-release CLI in dry-run mode with the
analyzer and notes plugins only, without publishing packages or GitHub releases. Credential
access, registry publication and release-asset delivery still require their
real release acceptance.
