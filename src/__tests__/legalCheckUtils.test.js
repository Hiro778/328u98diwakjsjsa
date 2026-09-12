import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  LEGAL_CHECK_STATUS,
  CHECK_STATUS_CONFIG,
  LEGAL_CATEGORY,
  CATEGORY_CONFIG,
  CATEGORY_PORTAL_MAP,
  normalizeCheckStatus,
  normalizeQuery,
  needsAction,
  getStatusConfig,
  getStatusLabel,
  getCategoryPortalKey,
  validateNibNumber,
  validatePirtNumber,
  validateHalalNumber,
  validateBrandName,
  validateDate,
  validateNotes,
  DISCLAIMER,
} from '../lib/legalUtils.js'

// ─── LEGAL_CHECK_STATUS ──────────────────────────────────

describe('LEGAL_CHECK_STATUS', () => {
  it('has exactly 5 statuses', () => {
    const keys = Object.keys(LEGAL_CHECK_STATUS)
    assert.equal(keys.length, 5)
  })

  it('has all required statuses', () => {
    assert.equal(LEGAL_CHECK_STATUS.CHECKING, 'CHECKING')
    assert.equal(LEGAL_CHECK_STATUS.FOUND, 'FOUND')
    assert.equal(LEGAL_CHECK_STATUS.NOT_FOUND, 'NOT_FOUND')
    assert.equal(LEGAL_CHECK_STATUS.ERROR, 'ERROR')
    assert.equal(LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION, 'NEEDS_OFFICIAL_VERIFICATION')
  })

  it('does NOT contain old status values', () => {
    assert.equal(LEGAL_CHECK_STATUS.NOT_CHECKED, undefined)
    assert.equal(LEGAL_CHECK_STATUS.USER_REPORTED, undefined)
    assert.equal(LEGAL_CHECK_STATUS.NEEDS_ACTION, undefined)
    assert.equal(LEGAL_CHECK_STATUS.EXTERNAL_VERIFY, undefined)
  })
})

// ─── CHECK_STATUS_CONFIG ──────────────────────────────────

describe('CHECK_STATUS_CONFIG', () => {
  it('has config for each status', () => {
    for (const status of Object.values(LEGAL_CHECK_STATUS)) {
      const config = CHECK_STATUS_CONFIG[status]
      assert.ok(config, `Missing config for ${status}`)
      assert.ok(config.label, `Missing label for ${status}`)
      assert.ok(config.bgClass, `Missing bgClass for ${status}`)
      assert.ok(config.textClass, `Missing textClass for ${status}`)
      assert.ok(config.borderClass, `Missing borderClass for ${status}`)
    }
  })
})

// ─── normalizeCheckStatus ─────────────────────────────────

describe('normalizeCheckStatus', () => {
  it('returns NEEDS_OFFICIAL_VERIFICATION for empty/null/undefined', () => {
    assert.equal(normalizeCheckStatus(''), LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION)
    assert.equal(normalizeCheckStatus(null), LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION)
    assert.equal(normalizeCheckStatus(undefined), LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION)
    assert.equal(normalizeCheckStatus(0), LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION)
  })

  it('normalizes valid status strings', () => {
    assert.equal(normalizeCheckStatus('CHECKING'), LEGAL_CHECK_STATUS.CHECKING)
    assert.equal(normalizeCheckStatus('FOUND'), LEGAL_CHECK_STATUS.FOUND)
    assert.equal(normalizeCheckStatus('NOT_FOUND'), LEGAL_CHECK_STATUS.NOT_FOUND)
    assert.equal(normalizeCheckStatus('ERROR'), LEGAL_CHECK_STATUS.ERROR)
    assert.equal(normalizeCheckStatus('NEEDS_OFFICIAL_VERIFICATION'), LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION)
  })

  it('handles case-insensitive input', () => {
    assert.equal(normalizeCheckStatus('checking'), LEGAL_CHECK_STATUS.CHECKING)
    assert.equal(normalizeCheckStatus('found'), LEGAL_CHECK_STATUS.FOUND)
    assert.equal(normalizeCheckStatus('not_found'), LEGAL_CHECK_STATUS.NOT_FOUND)
    assert.equal(normalizeCheckStatus('Needs_Official_Verification'), LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION)
  })

  it('handles whitespace', () => {
    assert.equal(normalizeCheckStatus('  CHECKING  '), LEGAL_CHECK_STATUS.CHECKING)
    assert.equal(normalizeCheckStatus(' FOUND '), LEGAL_CHECK_STATUS.FOUND)
  })

  it('returns NEEDS_OFFICIAL_VERIFICATION for unknown values', () => {
    assert.equal(normalizeCheckStatus('UNKNOWN'), LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION)
    assert.equal(normalizeCheckStatus('SOMETHING_ELSE'), LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION)
    assert.equal(normalizeCheckStatus('OLD_STATUS'), LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION)
  })
})

// ─── normalizeQuery ───────────────────────────────────────

describe('normalizeQuery', () => {
  it('trims whitespace', () => {
    assert.equal(normalizeQuery('  Kecap Bango  '), 'kecap bango')
  })

  it('lowercases', () => {
    assert.equal(normalizeQuery('KECAP BANGO'), 'kecap bango')
  })

  it('collapses multiple spaces', () => {
    assert.equal(normalizeQuery('  Kopi   Nusantara  '), 'kopi nusantara')
  })

  it('returns empty string for null/undefined/empty', () => {
    assert.equal(normalizeQuery(''), '')
    assert.equal(normalizeQuery(null), '')
    assert.equal(normalizeQuery(undefined), '')
  })

  it('handles tabs and newlines', () => {
    assert.equal(normalizeQuery('Kopi\tNusantara\n'), 'kopi nusantara')
  })

  it('handles special characters', () => {
    assert.equal(normalizeQuery('  PT.  Berkah  Abadi!  '), 'pt. berkah abadi!')
  })
})

// ─── needsAction ──────────────────────────────────────────

describe('needsAction', () => {
  it('returns true for NOT_FOUND', () => {
    assert.equal(needsAction(LEGAL_CHECK_STATUS.NOT_FOUND), true)
  })

  it('returns true for NEEDS_OFFICIAL_VERIFICATION', () => {
    assert.equal(needsAction(LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION), true)
  })

  it('returns false for FOUND', () => {
    assert.equal(needsAction(LEGAL_CHECK_STATUS.FOUND), false)
  })

  it('returns false for CHECKING', () => {
    assert.equal(needsAction(LEGAL_CHECK_STATUS.CHECKING), false)
  })

  it('returns false for ERROR', () => {
    assert.equal(needsAction(LEGAL_CHECK_STATUS.ERROR), false)
  })

  it('returns true for empty/null (defaults to NEEDS_OFFICIAL_VERIFICATION)', () => {
    assert.equal(needsAction(''), true)
    assert.equal(needsAction(null), true)
  })
})

// ─── getStatusConfig / getStatusLabel ─────────────────────

describe('getStatusConfig', () => {
  it('returns config for each valid status', () => {
    for (const status of Object.values(LEGAL_CHECK_STATUS)) {
      const config = getStatusConfig(status)
      assert.ok(config, `Missing config for ${status}`)
      assert.ok(config.label, `Missing label for ${status}`)
    }
  })

  it('defaults to NEEDS_OFFICIAL_VERIFICATION config for unknown', () => {
    const config = getStatusConfig('UNKNOWN')
    assert.equal(config.label, CHECK_STATUS_CONFIG[LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION].label)
  })
})

describe('getStatusLabel', () => {
  it('returns correct labels', () => {
    assert.equal(getStatusLabel(LEGAL_CHECK_STATUS.CHECKING), 'Sedang mengecek')
    assert.equal(getStatusLabel(LEGAL_CHECK_STATUS.FOUND), 'Ditemukan')
    assert.equal(getStatusLabel(LEGAL_CHECK_STATUS.NOT_FOUND), 'Belum ditemukan')
    assert.equal(getStatusLabel(LEGAL_CHECK_STATUS.ERROR), 'Kesalahan')
    assert.equal(getStatusLabel(LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION), 'Perlu pengecekan')
  })
})

// ─── LEGAL_CATEGORY / CATEGORY_CONFIG ─────────────────────

describe('LEGAL_CATEGORY', () => {
  it('has 4 categories', () => {
    assert.equal(Object.keys(LEGAL_CATEGORY).length, 4)
  })

  it('has correct values', () => {
    assert.equal(LEGAL_CATEGORY.NIB, 'nib')
    assert.equal(LEGAL_CATEGORY.PIRT, 'pirt')
    assert.equal(LEGAL_CATEGORY.HALAL, 'halal')
    assert.equal(LEGAL_CATEGORY.TRADEMARK, 'trademark')
  })
})

describe('CATEGORY_CONFIG', () => {
  it('has config for each category', () => {
    for (const cat of Object.values(LEGAL_CATEGORY)) {
      const config = CATEGORY_CONFIG[cat]
      assert.ok(config, `Missing config for ${cat}`)
      assert.ok(config.label, `Missing label for ${cat}`)
      assert.ok(config.shortLabel, `Missing shortLabel for ${cat}`)
      assert.ok(config.portalKey, `Missing portalKey for ${cat}`)
      assert.ok(config.icon, `Missing icon for ${cat}`)
    }
  })
})

// ─── CATEGORY_PORTAL_MAP ──────────────────────────────────

describe('CATEGORY_PORTAL_MAP', () => {
  it('maps nib to oss', () => {
    assert.equal(CATEGORY_PORTAL_MAP.nib, 'oss')
  })

  it('maps pirt to pirt', () => {
    assert.equal(CATEGORY_PORTAL_MAP.pirt, 'pirt')
  })

  it('maps halal to halal', () => {
    assert.equal(CATEGORY_PORTAL_MAP.halal, 'halal')
  })

  it('maps trademark to djki', () => {
    assert.equal(CATEGORY_PORTAL_MAP.trademark, 'djki')
  })
})

describe('getCategoryPortalKey', () => {
  it('returns correct portal key for each category', () => {
    assert.equal(getCategoryPortalKey('nib'), 'oss')
    assert.equal(getCategoryPortalKey('pirt'), 'pirt')
    assert.equal(getCategoryPortalKey('halal'), 'halal')
    assert.equal(getCategoryPortalKey('trademark'), 'djki')
  })

  it('returns empty string for unknown category', () => {
    assert.equal(getCategoryPortalKey('unknown'), '')
  })
})

// ─── Validators (retained) ───────────────────────────────

describe('validateNibNumber', () => {
  it('accepts valid NIB', () => {
    assert.ok(validateNibNumber('1234567890123').valid)
  })

  it('rejects too short', () => {
    assert.equal(validateNibNumber('123').valid, false)
  })

  it('rejects special chars', () => {
    assert.equal(validateNibNumber('12345-67890123').valid, false)
  })

  it('accepts empty', () => {
    assert.ok(validateNibNumber('').valid)
  })

  it('accepts null', () => {
    assert.ok(validateNibNumber(null).valid)
  })
})

describe('validatePirtNumber', () => {
  it('accepts valid PIRT number', () => {
    assert.ok(validatePirtNumber('202345678901').valid)
  })

  it('rejects too short', () => {
    assert.equal(validatePirtNumber('12').valid, false)
  })

  it('accepts empty', () => {
    assert.ok(validatePirtNumber('').valid)
  })
})

describe('validateHalalNumber', () => {
  it('accepts valid halal number', () => {
    assert.ok(validateHalalNumber('123456789012345').valid)
  })

  it('rejects too short', () => {
    assert.equal(validateHalalNumber('12').valid, false)
  })

  it('accepts empty', () => {
    assert.ok(validateHalalNumber('').valid)
  })
})

describe('validateBrandName', () => {
  it('accepts valid brand', () => {
    assert.ok(validateBrandName('Bango').valid)
  })

  it('rejects too short', () => {
    assert.equal(validateBrandName('A').valid, false)
  })

  it('rejects too long', () => {
    assert.equal(validateBrandName('A'.repeat(101)).valid, false)
  })

  it('accepts empty', () => {
    assert.ok(validateBrandName('').valid)
  })
})

describe('validateDate', () => {
  it('accepts valid date', () => {
    assert.ok(validateDate('2024-01-15').valid)
  })

  it('rejects invalid date', () => {
    assert.equal(validateDate('not-a-date').valid, false)
  })

  it('accepts empty', () => {
    assert.ok(validateDate('').valid)
  })
})

describe('validateNotes', () => {
  it('accepts normal text', () => {
    assert.ok(validateNotes('Some notes').valid)
  })

  it('rejects over 500 chars', () => {
    assert.equal(validateNotes('A'.repeat(501)).valid, false)
  })

  it('accepts empty', () => {
    assert.ok(validateNotes('').valid)
  })
})

// ─── DISCLAIMER ───────────────────────────────────────────

describe('DISCLAIMER', () => {
  it('has general text', () => {
    assert.ok(DISCLAIMER.general)
    assert.ok(DISCLAIMER.general.includes('BisnisSehat'))
  })

  it('has checkResult text', () => {
    assert.ok(DISCLAIMER.checkResult)
    assert.ok(DISCLAIMER.checkResult.includes('portal pemerintah'))
  })

  it('does NOT claim BisnisSehat performs official verification', () => {
    // The disclaimer should say it is NOT a government decision
    assert.ok(DISCLAIMER.general.includes('bukan'), 'Should contain "bukan" (not)')
    assert.ok(
      DISCLAIMER.general.includes('bukan verifikasi') || DISCLAIMER.general.includes('bukan keputusan'),
      'Should clarify BisnisSehat is not an official verification'
    )
  })
})
