import { Configuration, Project, execUtils, structUtils } from '@yarnpkg/core'
import { npath } from '@yarnpkg/fslib'
import gitPluginPackage from '@yarnpkg/plugin-git'
import versionPluginPackage, { versionUtils } from '@yarnpkg/plugin-version'

const projectCwd = npath.toPortablePath(process.env.RELEASE_PROJECT_CWD)
const phase = process.env.RELEASE_DECISIONS_PHASE

if (phase !== 'changed' && phase !== 'dependents') {
  throw new Error(`Unsupported decision phase: ${phase}`)
}

const plugins = {
  modules: new Map([
    ['@yarnpkg/plugin-git', gitPluginPackage.default],
    ['@yarnpkg/plugin-version', versionPluginPackage.default],
  ]),
  plugins: new Set(['@yarnpkg/plugin-git', '@yarnpkg/plugin-version']),
}

const configuration = await Configuration.find(projectCwd, plugins, { strict: false })
const { project } = await Project.find(configuration, projectCwd)
const ident = (workspace) => structUtils.stringifyIdent(workspace.manifest.name)
const pattern = (workspaces) => {
  const names = workspaces.map(ident).sort()

  if (names.length === 0) return '{}'
  if (names.length === 1) return names[0]

  return `{${names.join(',')}}`
}

let publicWorkspaces
let privateWorkspaces = []

if (phase === 'changed') {
  const versionFile = await versionUtils.openVersionFile(project, { allowEmpty: true })

  publicWorkspaces = [...versionFile.changedWorkspaces].filter(
    (workspace) =>
      workspace.relativeCwd !== '.' &&
      !workspace.manifest.private &&
      !versionFile.releases.has(workspace)
  )
} else {
  const resolved = new Set()

  let remainingAttempts = project.workspaces.length

  while (remainingAttempts > 0) {
    remainingAttempts -= 1
    // eslint-disable-next-line no-await-in-loop
    const versionFile = await versionUtils.openVersionFile(project, { allowEmpty: true })
    const undecided = [
      ...new Set(versionUtils.getUndecidedDependentWorkspaces(versionFile).flat()),
    ].filter((workspace) => workspace.relativeCwd !== '.' && !versionFile.releases.has(workspace))

    if (undecided.length === 0) break

    for (const workspace of undecided) {
      // eslint-disable-next-line no-await-in-loop
      await execUtils.execvp(
        'yarn',
        [
          'workspace',
          ident(workspace),
          'version',
          workspace.manifest.private ? 'decline' : 'patch',
          '--deferred',
        ],
        { cwd: projectCwd, strict: true }
      )

      resolved.add(workspace)
    }
  }

  const versionFile = await versionUtils.openVersionFile(project, { allowEmpty: true })
  const remaining = versionUtils
    .getUndecidedDependentWorkspaces(versionFile)
    .flat()
    .filter((workspace) => workspace.relativeCwd !== '.' && !versionFile.releases.has(workspace))

  if (remaining.length > 0) throw new Error('Yarn still requires dependent release decisions')

  publicWorkspaces = [...resolved].filter((workspace) => !workspace.manifest.private)
  privateWorkspaces = [...resolved].filter((workspace) => workspace.manifest.private)
}

for (const workspace of publicWorkspaces) {
  if (!workspace.manifest.name || !workspace.manifest.version) {
    throw new Error(`Changed public workspace ${workspace.relativeCwd} requires a name and version`)
  }
}

process.stdout.write(`pattern=${pattern(publicWorkspaces)}\n`)
process.stdout.write(`privatePattern=${pattern(privateWorkspaces)}\n`)
