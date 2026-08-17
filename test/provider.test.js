import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseSkillFile, name as pluginName } from '../index.js'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EXPECTED_SKILLS = [
  'save',
  'wiki',
  'wiki-ingest',
  'wiki-lint',
  'wiki-query',
]

async function providerOf() {
  const { apply } = await import('../index.js')
  let provider
  const ctx = {
    skills: {
      registerProvider(create) {
        provider = create({ signal: new AbortController().signal, invalidate() {} })
        return () => {}
      },
    },
  }
  apply(ctx)
  return provider
}

test('list() returns the five bundled skills with valid catalog fields', async () => {
  const provider = await providerOf()
  assert.equal(provider.name, pluginName)
  const candidates = await provider.list({})
  assert.deepEqual(candidates.map(candidate => candidate.name), EXPECTED_SKILLS)
  for (const candidate of candidates) {
    assert.match(candidate.name, SKILL_NAME)
    assert.ok(candidate.description.length > 0)
    assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true })
    assert.equal(candidate.source, 'bundled')
    assert.equal(candidate.provider, pluginName)
    assert.equal(candidate.rank, 600)
    assert.equal(candidate.resourceBase.kind, 'directory')
    assert.ok(existsSync(join(candidate.resourceBase.path, 'SKILL.md')))
  }
})

test('get() loads a full definition whose content carries the adaptation note', async () => {
  const provider = await providerOf()
  const candidates = await provider.list({})
  const target = candidates.find(candidate => candidate.name === 'wiki-query')
  assert.notEqual(target, undefined)
  const definition = await provider.get(target, {})
  assert.notEqual(definition, undefined)
  assert.equal(definition.name, 'wiki-query')
  assert.ok(definition.content.includes('# wiki-query: Query the Wiki'))
  assert.ok(definition.content.includes('dsh adaptation'), 'adaptation note present')
  assert.ok(definition.content.length > 500)
})

test('wiki skill references ship as resource files', async () => {
  const provider = await providerOf()
  const candidates = await provider.list({})
  const wiki = candidates.find(candidate => candidate.name === 'wiki')
  assert.ok(existsSync(join(wiki.resourceBase.path, 'references', 'frontmatter.md')))
})

test('the upstream promotional footer is removed from every body', async () => {
  const provider = await providerOf()
  const candidates = await provider.list({})
  for (const candidate of candidates) {
    const definition = await provider.get(candidate, {})
    assert.ok(!definition.content.includes('skool.com'), `${candidate.name} has no promo footer`)
    assert.ok(!definition.content.includes('Community Footer'), `${candidate.name} has no footer section`)
  }
})

test('parseSkillFile rejects malformed frontmatter loudly', () => {
  const cases = [
    ['# Heading\n\nNo frontmatter.', 'missing opening fence'],
    ['---\nname: wiki-demo\ndescription: A demo.\n', 'missing closing fence'],
    ['---\nname: Wiki-Demo\ndescription: A demo.\n---\nBody\n', 'non-kebab-case name'],
    ['---\nname: wiki-demo\ndescription: ""\n---\nBody\n', 'empty description'],
  ]
  for (const [raw, why] of cases) {
    assert.throws(() => parseSkillFile(raw, why), Error, `must reject: ${why}`)
  }
})
