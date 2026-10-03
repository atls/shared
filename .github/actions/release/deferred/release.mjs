/* eslint-disable n/no-sync, no-await-in-loop */
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { ConventionalChangelog } from 'conventional-changelog'
import conventionalCommits, {
  DEFAULT_COMMIT_TYPES,
} from 'conventional-changelog-conventionalcommits'
import { Bumper } from 'conventional-recommended-bump'

const root = process.env.GITHUB_WORKSPACE && realpathSync(process.env.GITHUB_WORKSPACE)
const acceptedSha = process.env.ACCEPTED_SHA
const dryRun = process.env.RELEASE_DRY_RUN === 'true'
const branch = 'master'
const commitSubject = 'chore(common): versions'

function run(command, args, options = {}) {
  const env = { ...process.env }
  if (command === 'yarn') delete env.NODE_OPTIONS
  const executable = command === 'yarn' ? 'corepack' : command
  const argv = command === 'yarn' ? ['yarn', ...args] : args
  const output = execFileSync(executable, argv, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  })
  return typeof output === 'string' ? output.trim() : ''
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message)
}

function records(output) {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const record = JSON.parse(line)
      requireCondition(
        typeof record.ident === 'string' && typeof record.cwd === 'string',
        'Invalid Yarn version record'
      )
      requireCondition(
        typeof record.oldVersion === 'string' && typeof record.newVersion === 'string',
        'Invalid Yarn version record'
      )
      return record
    })
}

function revisionMap(items) {
  return items
    .map(({ ident, oldVersion, newVersion }) => `${ident}:${oldVersion}:${newVersion}`)
    .sort()
}

function packagePath(cwd) {
  const path = realpathSync(cwd)
  requireCondition(
    path === resolve(root) || path.startsWith(`${resolve(root)}${sep}`),
    `Workspace is outside checkout: ${cwd}`
  )
  return path
}

async function releaseNotes(plan, preset, releaseDate, to) {
  const generator = new ConventionalChangelog(root)
    .config(preset)
    .package({ ...plan.manifest, version: plan.newVersion })
    .tags({ prefix: `${plan.name}@`, to })
    .commits({ from: plan.fromTag || '', to, path: plan.path || '.' })
    .context({ date: releaseDate })
  if (process.env.RELEASE_REPOSITORY) {
    generator.repository(`https://github.com/${process.env.RELEASE_REPOSITORY}`)
  }
  let notes = ''
  for await (const part of generator.write()) notes += part
  requireCondition(notes.trim().length > 0, `Empty changelog for ${plan.name}`)
  return notes.trimEnd()
}

function remoteSha() {
  const line = run('git', ['ls-remote', 'origin', `refs/heads/${branch}`])
  requireCondition(
    /^[a-f0-9]{40}\s+refs\/heads\/master$/.test(line),
    'Cannot identify remote master'
  )
  return line.slice(0, 40)
}

function revisionFile(sha, path, file) {
  return `${sha}:${path ? `${path}/` : ''}${file}`
}

function deliveredReleaseSha(currentRemote) {
  requireCondition(
    run('git', ['merge-base', acceptedSha, currentRemote]) === acceptedSha,
    'Remote master does not contain the accepted commit'
  )
  const descendants = run('git', [
    'rev-list',
    '--reverse',
    '--ancestry-path',
    `${acceptedSha}..${currentRemote}`,
  ])
    .split('\n')
    .filter(Boolean)
  const candidates = descendants.filter(
    (sha) =>
      run('git', ['rev-parse', `${sha}^`]) === acceptedSha &&
      run('git', ['show', '-s', '--format=%s', sha]) === commitSubject &&
      run('git', ['show', '-s', '--format=%an', sha]) === 'atls-release[bot]'
  )
  requireCondition(candidates.length <= 1, 'Multiple release commits follow the accepted commit')
  return candidates[0]
}

function remoteTagCommit(tag) {
  const ref = `refs/tags/${tag}`
  const refs = run('git', ['ls-remote', 'origin', ref, `${ref}^{}`])
    .split('\n')
    .filter(Boolean)
  if (refs.length === 0) return undefined
  const peeled = refs.find((line) => line.endsWith(`\t${ref}^{}`))
  const selected = peeled ?? refs.find((line) => line.endsWith(`\t${ref}`))
  requireCondition(selected && /^[a-f0-9]{40}\s/.test(selected), `Invalid remote tag: ${tag}`)
  return selected.slice(0, 40)
}

function publishedMetadata(plan) {
  let output
  try {
    output = run('yarn', ['npm', 'info', `${plan.name}@${plan.newVersion}`, '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const diagnostic = `${error.stdout?.toString() || ''}\n${error.stderr?.toString() || ''}`
    if (diagnostic.includes('YN0035') && /\b404\b/.test(diagnostic)) return undefined
    throw error
  }
  const metadata = JSON.parse(output)
  return metadata.version === plan.newVersion ? metadata : undefined
}

async function deferChangedWorkspaceVersions(releaseBaseSha) {
  const preset = await conventionalCommits()
  const previousMaster = run('git', ['rev-parse', `${releaseBaseSha}^`])
  const baselineTag = await new Bumper(root)
    .tag({ prefix: /.*@/, to: releaseBaseSha })
    .getLastSemverTag()
  const workspaces = run('yarn', ['workspaces', 'list', '--json'])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const manifests = []
  const targets = []
  const fromTags = new Map()

  for (const workspace of workspaces) {
    requireCondition(
      typeof workspace.location === 'string' && typeof workspace.name === 'string',
      'Invalid Yarn workspace entry'
    )
    const cwd = packagePath(resolve(root, workspace.location))
    manifests.push(relative(root, resolve(cwd, 'package.json')))
    const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'))
    if (!manifest.private && manifest.version) {
      const manifestPath = relative(root, resolve(cwd, 'package.json'))
      const lastManifestCommit = run('git', [
        'log',
        '-1',
        '--format=%s',
        releaseBaseSha,
        '--',
        manifestPath,
      ])
      requireCondition(
        lastManifestCommit !== commitSubject ||
          remoteTagCommit(`${workspace.name}@${manifest.version}`) !== undefined,
        `Previous release is untagged; retry it before releasing ${workspace.name}`
      )
      const bumper = new Bumper(root)
        .config(preset)
        .tag({ prefix: `${workspace.name}@`, to: releaseBaseSha })
        .commits({ to: releaseBaseSha, path: workspace.location })
      const previousTag = await bumper.getLastSemverTag()
      if (!previousTag && baselineTag) bumper.tag(baselineTag)
      if (
        !previousTag &&
        !baselineTag &&
        run('git', ['ls-tree', '--name-only', previousMaster, '--', manifestPath])
      ) {
        const previousManifest = JSON.parse(
          run('git', ['show', revisionFile(previousMaster, relative(root, cwd), 'package.json')])
        )
        requireCondition(
          previousManifest.private || !previousManifest.version,
          `Existing public workspace has no release tag: ${workspace.name}`
        )
      }
      const recommendation = await bumper.bump(preset.whatBump)
      const releaseType =
        recommendation.releaseType ?? (recommendation.commits.length > 0 ? 'patch' : undefined)

      if (releaseType) {
        run('yarn', ['workspace', workspace.name, 'version', releaseType, '--deferred'])
        targets.push(workspace.name)
        fromTags.set(workspace.name, previousTag || baselineTag)
      }
    }
  }
  return { manifests, targets, fromTags }
}

async function main() {
  requireCondition(
    root && /^[a-f0-9]{40}$/.test(acceptedSha || ''),
    'Exact accepted SHA and GITHUB_WORKSPACE are required'
  )
  requireCondition(
    run('git', ['rev-parse', 'HEAD']) === acceptedSha,
    'Checkout is not the accepted commit'
  )
  requireCondition(run('git', ['status', '--porcelain']) === '', 'Release checkout must be clean')

  const currentRemote = remoteSha()
  let previousRelease
  let releaseBaseSha = acceptedSha
  if (currentRemote !== acceptedSha) {
    run('git', ['fetch', 'origin', currentRemote])
    previousRelease = deliveredReleaseSha(currentRemote)
    if (!previousRelease) {
      releaseBaseSha = currentRemote
      run('git', ['checkout', '--detach', releaseBaseSha], { stdio: 'inherit' })
    }
  }

  const { manifests, targets, fromTags } = await deferChangedWorkspaceVersions(releaseBaseSha)
  const preview = targets.flatMap((name) =>
    records(run('yarn', ['workspace', name, 'version', 'apply', '--dry-run', '--json']))
  )
  const plans = []
  for (const record of preview) {
    if (record.oldVersion !== record.newVersion) {
      const cwd = packagePath(record.cwd)
      const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'))
      requireCondition(
        manifest.name === record.ident && manifest.version === record.oldVersion,
        `Yarn record disagrees with ${cwd}`
      )
      if (!manifest.private) {
        plans.push({
          name: record.ident,
          oldVersion: record.oldVersion,
          newVersion: record.newVersion,
          cwd,
          path: relative(root, cwd),
          manifest,
          fromTag: fromTags.get(record.ident),
        })
      }
    }
  }

  if (plans.length === 0) {
    process.stdout.write('No public deferred workspace releases\n')
    return
  }

  const preset = await conventionalCommits({
    types: DEFAULT_COMMIT_TYPES.map((type) =>
      type.effect === 'hidden' ? { ...type, effect: 'changelog' } : type
    ),
  })
  const releaseDate = run('git', ['show', '-s', '--format=%cs', releaseBaseSha])
  requireCondition(/^\d{4}-\d{2}-\d{2}$/.test(releaseDate), 'Invalid accepted commit date')
  for (const plan of plans)
    plan.notes = await releaseNotes(plan, preset, releaseDate, releaseBaseSha)
  process.stdout.write(
    `${JSON.stringify(
      plans.map(({ name, oldVersion, newVersion, path }) => ({
        name,
        oldVersion,
        newVersion,
        path,
      }))
    )}\n`
  )
  if (dryRun) return

  requireCondition(
    ['public', 'restricted'].includes(process.env.PACKAGE_ACCESS),
    'Invalid package access'
  )
  requireCondition(
    process.env.REGISTRY_SERVER && process.env.YARN_NPM_AUTH_TOKEN,
    'Registry and npm token are required'
  )
  requireCondition(
    (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) && process.env.RELEASE_REPOSITORY,
    'GitHub token and repository are required'
  )
  requireCondition(process.env.RUNNER_TEMP, 'Runner temporary directory is required')

  let releaseSha
  if (!previousRelease) {
    const applied = targets.flatMap((name) =>
      records(run('yarn', ['workspace', name, 'version', 'apply', '--json']))
    )
    requireCondition(
      JSON.stringify(revisionMap(applied)) === JSON.stringify(revisionMap(preview)),
      'Applied Yarn versions differ from the plan'
    )
    run('yarn', ['install', '--immutable'], { stdio: 'inherit' })
    for (const plan of plans) {
      const changelog = resolve(plan.cwd, 'CHANGELOG.md')
      const previous = await readFile(changelog, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return ''
        throw error
      })
      await writeFile(changelog, `${plan.notes}\n\n${previous}`)
    }
    const releaseFiles = [
      ...manifests,
      ...plans.map((plan) => relative(root, resolve(plan.cwd, 'CHANGELOG.md'))),
      'yarn.lock',
      '.pnp.cjs',
      '.pnp.loader.mjs',
      '.yarn/versions',
    ]
    for (const file of new Set(releaseFiles)) {
      if (existsSync(resolve(root, file)) || run('git', ['ls-files', '--', file])) {
        run('git', ['add', '-A', '--', file])
      }
    }
    run('git', [
      '-c',
      'user.name=atls-release[bot]',
      '-c',
      'user.email=atls-release[bot]@users.noreply.github.com',
      'commit',
      '-m',
      commitSubject,
    ])
    releaseSha = run('git', ['rev-parse', 'HEAD'])
    requireCondition(remoteSha() === releaseBaseSha, 'Master moved before publication')
    run('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], { stdio: 'inherit' })
    requireCondition(remoteSha() === releaseSha, 'Release commit was not delivered to master')
  } else {
    releaseSha = previousRelease
    for (const plan of plans) {
      const manifest = JSON.parse(
        run('git', ['show', revisionFile(releaseSha, plan.path, 'package.json')])
      )
      requireCondition(
        manifest.version === plan.newVersion,
        `Release commit version differs for ${plan.name}`
      )
      const changelog = run('git', ['show', revisionFile(releaseSha, plan.path, 'CHANGELOG.md')])
      requireCondition(
        changelog.startsWith(plan.notes),
        `Release commit changelog differs for ${plan.name}`
      )
    }
    run('git', ['checkout', '--detach', releaseSha], { stdio: 'inherit' })
    run('yarn', ['install', '--immutable'], { stdio: 'inherit' })
  }

  for (const plan of plans) {
    const tag = `${plan.name}@${plan.newVersion}`
    const tagCommit = remoteTagCommit(tag)
    requireCondition(
      tagCommit === undefined || tagCommit === releaseSha,
      `Existing tag points to a different commit: ${tag}`
    )
    const existing = publishedMetadata(plan)
    requireCondition(
      !existing || existing.gitHead === releaseSha,
      `Registry version belongs to a different commit: ${tag}`
    )
  }

  const publishArgs = ['workspaces', 'foreach', '--all', '--no-private', '--topological']
  for (const plan of plans) publishArgs.push('--include', plan.name)
  publishArgs.push('npm', 'publish', '--tolerate-republish', '--access', process.env.PACKAGE_ACCESS)
  run('yarn', publishArgs, { stdio: 'inherit' })

  for (const plan of plans) {
    requireCondition(
      publishedMetadata(plan)?.gitHead === releaseSha,
      `Registry did not confirm the release commit for ${plan.name}@${plan.newVersion}`
    )
  }

  for (const plan of plans) {
    const tag = `${plan.name}@${plan.newVersion}`
    const notesFile = resolve(process.env.RUNNER_TEMP, `release-${plans.indexOf(plan)}.md`)
    await writeFile(notesFile, `${plan.notes}\n`)
    let existing = ''
    try {
      existing = run(
        'gh',
        [
          'release',
          'view',
          tag,
          '--repo',
          process.env.RELEASE_REPOSITORY,
          '--json',
          'targetCommitish,body',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch (error) {
      if (error.stderr?.toString().trim() !== 'release not found') throw error
    }
    if (existing) {
      const release = JSON.parse(existing)
      requireCondition(
        release.targetCommitish === releaseSha && release.body.trim() === plan.notes,
        `Existing GitHub Release differs: ${tag}`
      )
    } else {
      run(
        'gh',
        [
          'release',
          'create',
          tag,
          '--repo',
          process.env.RELEASE_REPOSITORY,
          '--target',
          releaseSha,
          '--title',
          tag,
          '--notes-file',
          notesFile,
        ],
        { stdio: 'inherit' }
      )
    }
    requireCondition(remoteTagCommit(tag) === releaseSha, `Release tag differs: ${tag}`)
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
