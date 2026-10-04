import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const packageCwd = dirname(dirname(fileURLToPath(import.meta.url)))
const selector = join(packageCwd, 'src/select.mjs')

const write = async (root, path, content) => {
  const target = join(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
}

const git = async (root, ...args) => execute('git', args, { cwd: root })

const fixture = async (changed = ['a', 'b']) => {
  const root = await mkdtemp(join(tmpdir(), 'shared-workspace-decisions-'))

  await write(
    root,
    'package.json',
    JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*'] })
  )
  await write(
    root,
    'packages/a/package.json',
    JSON.stringify({ name: '@fixture/a', version: '0.2.7' })
  )
  await write(
    root,
    'packages/b/package.json',
    JSON.stringify({ name: '@fixture/b', version: '1.0.0' })
  )
  await write(root, 'packages/a/index.js', 'export const a = 1\n')
  await write(root, 'packages/b/index.js', 'export const b = 1\n')
  await git(root, 'init', '-q')
  await git(root, 'add', '.')
  await git(
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'chore: baseline'
  )

  await Promise.all(
    changed.map(async (name) =>
      write(root, `packages/${name}/index.js`, `export const ${name} = 2\n`)
    )
  )

  return root
}

const select = async (root) => {
  const result = await execute(process.execPath, [selector], {
    cwd: packageCwd,
    env: {
      ...process.env,
      RELEASE_PROJECT_CWD: root,
      RELEASE_DECISIONS_PHASE: 'changed',
      YARN_CHANGESET_BASE_REFS: 'HEAD',
    },
  })

  return result.stdout
}

test('select both changed public workspaces without deferred records', async () => {
  const root = await fixture()

  try {
    assert.equal(await select(root), 'pattern={@fixture/a,@fixture/b}\nprivatePattern={}\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('preserve explicit release and decline decisions', async () => {
  const root = await fixture()

  try {
    await write(root, '.yarn/versions/decision.yml', 'releases:\n  "@fixture/a": minor\n')
    assert.equal(await select(root), 'pattern=@fixture/b\nprivatePattern={}\n')
    await write(
      root,
      '.yarn/versions/decision.yml',
      'releases:\n  "@fixture/a": minor\n\ndeclined:\n  - "@fixture/b"\n'
    )
    assert.equal(await select(root), 'pattern={}\nprivatePattern={}\n')
    assert.match(await readFile(join(root, '.yarn/versions/decision.yml'), 'utf8'), /@fixture\/b/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ignore documentation outside public workspaces', async () => {
  const root = await fixture([])

  try {
    await write(root, 'README.md', 'Documentation only\n')
    assert.equal(await select(root), 'pattern={}\nprivatePattern={}\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('include a new public workspace', async () => {
  const root = await fixture([])

  try {
    await write(
      root,
      'packages/c/package.json',
      JSON.stringify({ name: '@fixture/c', version: '0.0.0' })
    )
    await write(root, 'packages/c/index.js', 'export const c = 1\n')
    assert.equal(await select(root), 'pattern=@fixture/c\nprivatePattern={}\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
