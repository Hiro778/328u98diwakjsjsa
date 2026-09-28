// src/__tests__/logoAnalyzerComingSoon.test.js
// Verification suite for ui.md: Logo Analyzer COMING SOON requirements

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CATEGORIES,
  TOOL_AVAILABILITY,
  isToolAvailable,
} from '../data/categories.js'
import {
  LOGO_ANALYZER_ENABLED,
  checkLogoSimilarity,
  uploadLogoImage,
} from '../lib/legalitasService.js'

describe('ui.md: Logo Analyzer COMING SOON Verification Suite', () => {
  const logoTabSrc = fs.readFileSync(
    path.resolve('src/sections/Legalitas/LogoCheckTab.jsx'),
    'utf8'
  )
  const dashboardSrc = fs.readFileSync(
    path.resolve('src/sections/Legalitas/LegalitasDashboard.jsx'),
    'utf8'
  )
  const edgeFunctionSrc = fs.readFileSync(
    path.resolve('supabase/functions/legalitas-logo-check/index.ts'),
    'utf8'
  )

  // 1. Tool Catalog State
  describe('1. Tool Catalog / Source of Truth State', () => {
    it('Logo Analyzer exists in CATEGORIES.legal.tools', () => {
      const logoTool = CATEGORIES.legal.tools.find(
        (t) => t.name === 'Logo Analyzer'
      )
      assert.ok(logoTool, 'Logo Analyzer must exist in legal category')
    })

    it('Logo Analyzer has availability COMING_SOON and status coming_soon', () => {
      const logoTool = CATEGORIES.legal.tools.find(
        (t) => t.name === 'Logo Analyzer'
      )
      assert.equal(
        logoTool.availability,
        TOOL_AVAILABILITY.COMING_SOON,
        'Logo Analyzer availability must be COMING_SOON'
      )
      assert.equal(
        logoTool.status,
        'coming_soon',
        'Logo Analyzer status must be coming_soon'
      )
    })

    it('Logo Analyzer does NOT carry Free or Pro entitlement (NOT available, NOT pro, NOT locked)', () => {
      const logoTool = CATEGORIES.legal.tools.find(
        (t) => t.name === 'Logo Analyzer'
      )
      assert.notEqual(logoTool.requiresPro, true, 'Must NOT be marked requiresPro: true')
      assert.notEqual(logoTool.isFree, true, 'Must NOT be marked isFree: true')
      assert.notEqual(logoTool.requiresPro, false, 'Must NOT be marked requiresPro: false')
    })

    it('isToolAvailable reports false for Logo Analyzer', () => {
      const logoTool = CATEGORIES.legal.tools.find(
        (t) => t.name === 'Logo Analyzer'
      )
      assert.equal(
        isToolAvailable(logoTool),
        false,
        'isToolAvailable must return false for Logo Analyzer'
      )
    })

    it('Legalitas Checker remains LIVE and available', () => {
      const legalitasChecker = CATEGORIES.legal.tools.find(
        (t) => t.name === 'Legalitas Checker'
      )
      assert.ok(legalitasChecker, 'Legalitas Checker must exist')
      assert.equal(legalitasChecker.availability, 'LIVE')
      assert.equal(isToolAvailable(legalitasChecker), true)
    })
  })

  // 2. Server-Side Safety and Feature Flag
  describe('2. Server-Side Safety & Feature Flag', () => {
    it('LOGO_ANALYZER_ENABLED is explicitly exported as false in legalitasService.js', () => {
      assert.equal(
        LOGO_ANALYZER_ENABLED,
        false,
        'LOGO_ANALYZER_ENABLED must be false'
      )
    })

    it('checkLogoSimilarity rejects execution without calling Edge Functions or Google Vision when disabled', async () => {
      const res = await checkLogoSimilarity({
        imageUrl: 'https://example.com/fake.png',
        businessName: 'Toko Test',
      })
      assert.ok(res.error, 'Should return error indicating feature is disabled')
      assert.match(
        res.error,
        /Segera Hadir|belum aktif/i,
        'Error should state feature is coming soon / not active'
      )
      assert.equal(res.overallStatus, 'COMING_SOON')
      assert.deepEqual(res.results, [])
    })

    it('uploadLogoImage rejects execution when LOGO_ANALYZER_ENABLED is false', async () => {
      const dummyFile = { name: 'test.png', type: 'image/png', size: 1000 }
      const res = await uploadLogoImage(dummyFile, 'biz-123')
      assert.ok(res.error, 'Should return error indicating upload is disabled')
      assert.match(res.error, /dinonaktifkan|Segera Hadir/i)
    })

    it('Edge function enforces LOGO_ANALYZER_ENABLED feature flag safeguard', () => {
      assert.ok(
        edgeFunctionSrc.includes('LOGO_ANALYZER_ENABLED'),
        'Edge function must check LOGO_ANALYZER_ENABLED'
      )
      assert.ok(
        edgeFunctionSrc.includes('COMING_SOON'),
        'Edge function must return COMING_SOON when disabled'
      )
    })
  })

  // 3. UI State and Restrained Design
  describe('3. UI State and Design System Conformance', () => {
    it('LogoCheckTab displays clear Coming Soon hierarchy', () => {
      assert.ok(
        logoTabSrc.includes('Cek Logo & Kemiripan'),
        'Must display tool title'
      )
      assert.ok(
        logoTabSrc.includes('Analisis kemiripan logo dengan gambar yang tersedia di web.'),
        'Must display description'
      )
      assert.ok(
        logoTabSrc.includes('Segera Hadir'),
        'Must display status badge "Segera Hadir"'
      )
      assert.ok(
        logoTabSrc.includes('Fitur ini sedang dalam tahap pengembangan.'),
        'Must display subtext'
      )
    })

    it('LogoCheckTab does NOT render active dropzone, upload input, or executable button', () => {
      assert.ok(
        !logoTabSrc.includes('type="file"'),
        'Must not contain active file input'
      )
      assert.ok(
        !logoTabSrc.includes('Klik atau seret logo ke sini'),
        'Must not contain active upload dropzone prompt'
      )
      assert.ok(
        !logoTabSrc.includes('Analisis Logo'),
        'Must not contain executable analysis button'
      )
    })

    it('LegalitasDashboard tab bar preserves navigation and displays "Segera Hadir" badge on Logo tab', () => {
      assert.ok(
        dashboardSrc.includes('Cek Legalitas Usaha'),
        'Must preserve Cek Legalitas Usaha tab'
      )
      assert.ok(
        dashboardSrc.includes('Cek Logo & Kemiripan'),
        'Must preserve Cek Logo & Kemiripan tab'
      )
      assert.ok(
        dashboardSrc.includes("badge: 'Segera Hadir'"),
        'Must display Segera Hadir badge on tab control'
      )
    })
  })
})
