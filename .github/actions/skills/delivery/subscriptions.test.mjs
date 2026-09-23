import assert from 'node:assert/strict'
import test from 'node:test'
import { format, fromManifests, parse } from './subscriptions.mjs'

test('registers only declared latest skill packages across workspaces', () => {
  assert.deepEqual(fromManifests([
    { devDependencies: { '@atls/skill-dsm': 'latest', '@atls/skill-checkin': 'latest' } },
    { dependencies: { '@atls/skill-dsm': 'latest', '@atls/skill-cycle': '0.0.1' } },
  ]), ['checkin', 'dsm'])
})

test('matches exact package subscriptions', () => {
  assert.deepEqual(parse(format(['dsm', 'checkin', 'dsm'])), ['checkin', 'dsm'])
  assert.equal(parse('dsm').includes('dsm-extra'), false)
  assert.throws(() => parse('dsm, dsm'))
  assert.throws(() => format(['a'.repeat(76)]))
})
