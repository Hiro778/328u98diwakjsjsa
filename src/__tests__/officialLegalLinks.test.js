import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { LEGAL_LINKS, getLegalLink, getLegalUrl } from '../lib/officialLegalLinks.js'

describe('LEGAL_LINKS', () => {
  it('has all required portal links', () => {
    assert.ok(LEGAL_LINKS.oss, 'Missing OSS link')
    assert.ok(LEGAL_LINKS.ahu, 'Missing AHU link')
    assert.ok(LEGAL_LINKS.pirt, 'Missing PIRT/BPOM link')
    assert.ok(LEGAL_LINKS.halal, 'Missing Halal/BPJPH link')
    assert.ok(LEGAL_LINKS.djki, 'Missing DJKI link')
    assert.ok(LEGAL_LINKS.ossHelp, 'Missing OSS Help link')
  })

  it('each link has url, label, and description', () => {
    for (const [key, link] of Object.entries(LEGAL_LINKS)) {
      assert.ok(link.url.startsWith('https://'), `URL for ${key} must be HTTPS`)
      assert.ok(link.label, `Missing label for ${key}`)
      assert.ok(link.description, `Missing description for ${key}`)
    }
  })

  it('urls point to official government domains', () => {
    assert.ok(LEGAL_LINKS.oss.url.includes('oss.go.id'))
    assert.ok(LEGAL_LINKS.ahu.url.includes('ahu.go.id'))
    assert.ok(LEGAL_LINKS.pirt.url.includes('pom.go.id'))
    assert.ok(LEGAL_LINKS.halal.url.includes('halal.go.id'))
    assert.ok(LEGAL_LINKS.djki.url.includes('djki.go.id'))
  })
})

describe('getLegalLink', () => {
  it('returns link for valid key', () => {
    const link = getLegalLink('oss')
    assert.ok(link)
    assert.equal(link.url, 'https://oss.go.id')
  })

  it('returns null for invalid key', () => {
    assert.equal(getLegalLink('nonexistent'), null)
    assert.equal(getLegalLink(''), null)
    assert.equal(getLegalLink(null), null)
  })
})

describe('getLegalUrl', () => {
  it('returns url for valid key', () => {
    assert.equal(getLegalUrl('oss'), 'https://oss.go.id')
    assert.equal(getLegalUrl('halal'), 'https://halal.go.id')
  })

  it('returns empty string for invalid key', () => {
    assert.equal(getLegalUrl('nonexistent'), '')
    assert.equal(getLegalUrl(''), '')
    assert.equal(getLegalUrl(null), '')
  })
})
