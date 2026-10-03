/* eslint-disable n/no-sync, no-await-in-loop */
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { ConventionalChangelog } from 'conventional-changelog'
import conventionalCommits from 'conventional-changelog-conventionalcommits'
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

async function releaseNotes(plan, preset, releaseDate, range) {
  const generator = new ConventionalChangelog(root)
    .config(preset)
    .package({ ...plan.manifest, version: plan.newVersion })
    .tags({ prefix: `${plan.name}@`, to: range.from })
    .commits({ ...range, path: plan.path || '.' })
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
      run('git', ['show', '-s', '--format=%s', sha]) === commitSubject
  )
  requireCondition(candidates.length === 1, 'Expected release commit was not found on master')
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

function acceptedPullRange() {
  const number = process.env.RELEASE_PULL_NUMBER
  const headSha = process.env.RELEASE_PULL_HEAD_SHA
  requireCondition(/^\d+$/.test(number || ''), 'Pull request number is required')
  requireCondition(/^[a-f0-9]{40}$/.test(headSha || ''), 'Pull request head SHA is required')
  run('git', ['fetch', '--no-tags', 'origin', `refs/pull/${number}/head`], {
    stdio: 'inherit',
  })
  requireCondition(run('git', ['rev-parse', 'FETCH_HEAD']) === headSha, 'Pull request head moved')
  const previousMaster = run('git', ['rev-parse', `${acceptedSha}^`])
  return { from: run('git', ['merge-base', previousMaster, headSha]), to: headSha }
}

async function deferChangedWorkspaceVersions() {
  const range = acceptedPullRange()
  const preset = await conventionalCommits()
  const workspaces = run('yarn', ['workspaces', 'list', '--json'])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const manifests = []

  for (const workspace of workspaces) {
    requireCondition(
      typeof workspace.location === 'string' && typeof workspace.name === 'string',
      'Invalid Yarn workspace entry'
    )
    const cwd = packagePath(resolve(root, workspace.location))
    manifests.push(relative(root, resolve(cwd, 'package.json')))
    const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'))
    if (!manifest.private && manifest.version) {
      const recommendation = await new Bumper(root)
        .config(preset)
        .commits({ ...range, path: workspace.location })
        .bump(preset.whatBump)
      const releaseType =
        recommendation.releaseType ?? (recommendation.commits.length > 0 ? 'patch' : undefined)

      if (releaseType) {
        run('yarn', ['workspace', workspace.name, 'version', releaseType, '--deferred'])
      }
    }
  }
  return { range, manifests }
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

  const { range: releaseRange, manifests } = await deferChangedWorkspaceVersions()
  const preview = records(run('yarn', ['version', 'apply', '--all', '--dry-run', '--json']))
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
        })
      }
    }
  }

  if (plans.length === 0) {
    process.stdout.write('No public deferred workspace releases\n')
    return
  }

  const preset = await conventionalCommits()
  const releaseDate = run('git', ['show', '-s', '--format=%cs', acceptedSha])
  requireCondition(/^\d{4}-\d{2}-\d{2}$/.test(releaseDate), 'Invalid accepted commit date')
  for (const plan of plans) plan.notes = await releaseNotes(plan, preset, releaseDate, releaseRange)
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

  const currentRemote = remoteSha()
  let releaseSha
  if (currentRemote === acceptedSha) {
    const applied = records(run('yarn', ['version', 'apply', '--all', '--json']))
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
    requireCondition(remoteSha() === acceptedSha, 'Master moved before publication')
    run('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], { stdio: 'inherit' })
    requireCondition(remoteSha() === releaseSha, 'Release commit was not delivered to master')
  } else {
    run('git', ['fetch', 'origin', currentRemote])
    releaseSha = deliveredReleaseSha(currentRemote)
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
  }

  const publishArgs = ['workspaces', 'foreach', '--all', '--no-private', '--topological']
  for (const plan of plans) publishArgs.push('--include', plan.name)
  publishArgs.push('npm', 'publish', '--tolerate-republish', '--access', process.env.PACKAGE_ACCESS)
  run('yarn', publishArgs, { stdio: 'inherit' })

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
