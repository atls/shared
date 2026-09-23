import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { format, fromManifests, parse } from './subscriptions.mjs'

const propertyName = 'skill_packages'
const api = process.env.GITHUB_API_URL || 'https://api.github.com'
const token = process.env.SKILL_DELIVERY_TOKEN
const repository = process.env.SKILL_DELIVERY_REPOSITORY
const command = process.env.SKILL_DELIVERY_COMMAND

if (!/^atls\/[a-z0-9-]+$/.test(repository || '')) throw new Error('ATLS repository is required')
if (command !== 'update' && !token) throw new Error('Atlantis Courier token is required')

const request = async (method, path, body) => {
  const response = await fetch(new URL(path, api), {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'atls-skill-delivery',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) throw new Error(`${method} ${path}: GitHub returned ${response.status}`)
  return response.status === 204 ? undefined : response.json()
}

const pages = async (path) => {
  const results = []
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?'
    const batch = await request('GET', `${path}${separator}per_page=100&page=${page}`)
    results.push(...batch)
    if (batch.length < 100) return results
  }
}

const manifests = () => {
  const root = process.env.GITHUB_WORKSPACE
  if (!root) throw new Error('GITHUB_WORKSPACE is required')

  const paths = execFileSync('git', ['ls-files', '-z', '--', 'package.json', '**/package.json'], {
    cwd: root,
  }).toString().split('\0').filter(Boolean)
  return paths.map((path) => JSON.parse(readFileSync(join(root, path), 'utf8')))
}

const register = async () => {
  const slugs = fromManifests(manifests())

  await request('PATCH', `/repos/${repository}/properties/values`, {
    properties: [{ property_name: propertyName, value: format(slugs) }],
  })
  console.log(`Registered ${slugs.length} skill package subscription(s) for ${repository}`)
}

const update = () => {
  const announced = JSON.parse(process.env.SKILL_DELIVERY_PACKAGE_NAMES || 'null')
  if (!Array.isArray(announced) || announced.length === 0 || announced.some((name) => !/^@atls\/skill-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))) {
    throw new Error('Invalid announced skill packages')
  }

  const declared = fromManifests(manifests()).map((slug) => `@atls/skill-${slug}`)
  const subscribed = announced.some((name) => declared.includes(name))
  appendFileSync(process.env.GITHUB_OUTPUT, `subscribed=${subscribed}\n`)
  if (!subscribed) return

  const packageToken = process.env.SKILL_DELIVERY_PACKAGE_TOKEN
  if (!packageToken) throw new Error('Package read token is required')
  execFileSync('yarn', ['up', '-R', ...declared, '--mode=update-lockfile'], {
    cwd: process.env.GITHUB_WORKSPACE,
    env: {
      ...process.env,
      ATLS_SKILL_REGISTRY: 'https://npm.pkg.github.com',
      SKILLS_NPM_TOKEN: packageToken,
    },
    stdio: 'inherit',
  })

  const changed = execFileSync('git', ['diff', '--name-only'], {
    cwd: process.env.GITHUB_WORKSPACE,
  }).toString().trim().split('\n').filter(Boolean)
  if (changed.some((path) => path !== 'yarn.lock')) {
    throw new Error('Skill update changed files outside yarn.lock')
  }
}

const publishedPackages = async (pullNumber) => {
  const pull = await request('GET', `/repos/${repository}/pulls/${pullNumber}`)
  if (!pull.merged_at || pull.base.ref !== 'master') throw new Error('Expected a merged skills PR targeting master')

  const files = await pages(`/repos/${repository}/pulls/${pullNumber}/files`)
  const slugs = new Set(files.map(({ filename }) => /^skills\/([^/]+)\//.exec(filename)?.[1]).filter(Boolean))
  const packages = []

  for (const slug of slugs) {
    const file = await request('GET', `/repos/${repository}/contents/skills/${slug}/package.json?ref=master`)
    const manifest = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
    if (manifest.name !== `@atls/skill-${slug}`) throw new Error(`Unexpected package name in skills/${slug}`)

    const versions = await pages(`/orgs/atls/packages/npm/skill-${slug}/versions`)
    const version = versions.find(({ name }) => name === manifest.version)
    if (!version || Date.parse(version.created_at) < Date.parse(pull.merged_at)) {
      throw new Error(`${manifest.name}@${manifest.version} was not published by this merge`)
    }
    packages.push({ name: manifest.name, slug })
  }

  return packages
}

const notify = async () => {
  if (repository !== 'atls/skills') throw new Error('Notifications must originate from atls/skills')
  const pullNumber = Number(process.env.SKILL_DELIVERY_PULL_NUMBER)
  if (!Number.isSafeInteger(pullNumber) || pullNumber <= 0) throw new Error('A merged PR number is required')

  const packages = await publishedPackages(pullNumber)
  const repositories = await pages('/orgs/atls/properties/values')
  let dispatched = 0

  for (const target of repositories) {
    const value = target.properties.find(({ property_name }) => property_name === propertyName)?.value
    const subscriptions = parse(value)
    const names = packages.filter(({ slug }) => subscriptions.includes(slug)).map(({ name }) => name)
    if (names.length === 0) continue
    await request('POST', `/repos/${target.repository_full_name}/dispatches`, {
      event_type: 'skill-package-updated',
      client_payload: { packages: names },
    })
    dispatched += 1
  }

  console.log(`Dispatched ${dispatched} skill package update(s)`)
}

if (command === 'register') await register()
else if (command === 'notify') await notify()
else if (command === 'update') update()
else throw new Error('Unknown skill delivery command')
