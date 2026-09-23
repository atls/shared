import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import test from 'node:test'

test('notifies only the repository subscribed to the published skill', async () => {
  const dispatches = []
  const server = createServer(async (request, response) => {
    const path = request.url
    let result

    if (request.method === 'GET' && path === '/repos/atls/skills/pulls/10') {
      result = { merged_at: '2026-09-23T00:00:00Z', base: { ref: 'master' } }
    } else if (request.method === 'GET' && path === '/repos/atls/skills/pulls/10/files?per_page=100&page=1') {
      result = [{ filename: 'skills/dsm/SKILL.md' }]
    } else if (request.method === 'GET' && path === '/repos/atls/skills/contents/skills/dsm/package.json?ref=master') {
      result = { content: Buffer.from(JSON.stringify({ name: '@atls/skill-dsm', version: '0.0.2' })).toString('base64') }
    } else if (request.method === 'GET' && path === '/orgs/atls/packages/npm/skill-dsm/versions?per_page=100&page=1') {
      result = [{ name: '0.0.2', created_at: '2026-09-23T00:01:00Z' }]
    } else if (request.method === 'GET' && path === '/orgs/atls/properties/values?per_page=100&page=1') {
      result = [
        { repository_full_name: 'atls/widget', properties: [{ property_name: 'skill_packages', value: 'dsm' }] },
        { repository_full_name: 'atls/other', properties: [{ property_name: 'skill_packages', value: 'checkin' }] },
      ]
    } else if (request.method === 'POST' && path === '/repos/atls/widget/dispatches') {
      dispatches.push(JSON.parse(await new Promise((resolve) => {
        let body = ''
        request.on('data', (chunk) => { body += chunk })
        request.on('end', () => resolve(body))
      })))
      response.writeHead(204).end()
      return
    } else {
      response.writeHead(404).end()
      return
    }

    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const child = spawn(process.execPath, [new URL('./main.mjs', import.meta.url).pathname], {
      env: {
        ...process.env,
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
        SKILL_DELIVERY_COMMAND: 'notify',
        SKILL_DELIVERY_TOKEN: 'test-token',
        SKILL_DELIVERY_REPOSITORY: 'atls/skills',
        SKILL_DELIVERY_PULL_NUMBER: '10',
      },
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const exit = await new Promise((resolve) => child.on('exit', resolve))
    assert.equal(exit, 0, stderr)
    assert.deepEqual(dispatches, [{
      event_type: 'skill-package-updated',
      client_payload: { package: '@atls/skill-dsm', version: '0.0.2' },
    }])
  } finally {
    server.close()
  }
})
