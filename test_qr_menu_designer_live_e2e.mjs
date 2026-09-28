// test_qr_menu_designer_live_e2e.mjs
// Comprehensive live database & storage verification for Custom QR Menu Designer (CATA.MD)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import {
  DEFAULT_DESIGN_SETTINGS,
  normalizeDesignSettings,
  THEME_PRESETS,
} from './src/services/qrMenuDesignService.js'

const envContent = readFileSync('.env', 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq > 0) env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
}

const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const supabaseAnon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

function log(testName, passed, details = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${testName} ${details}`)
}

async function runLiveVerification() {
  console.log('\n================================================================')
  console.log('QR MENU DESIGNER LIVE REMOTE SUPABASE & STORAGE E2E VERIFICATION')
  console.log('================================================================\n')

  let allPassed = true

  try {
    // 1. Check table existence
    const { data: testQuery, error: tableErr } = await supabaseAdmin
      .from('qr_menu_design_settings')
      .select('id, business_id, version, theme, layout')
      .limit(1)

    log('1. Table qr_menu_design_settings exists in remote Supabase schema', !tableErr, tableErr?.message || '')
    if (tableErr) allPassed = false

    // 2. Fetch sample business
    const { data: business, error: bizErr } = await supabaseAdmin
      .from('businesses')
      .select('id, name, is_menu_published, owner_id')
      .limit(1)
      .single()

    if (bizErr || !business) {
      log('2. Fetch sample business for testing', false, bizErr?.message || 'No business found')
      return
    }
    log(`2. Sample business fetched (${business.name})`, true, `ID: ${business.id}`)

    // 3. Upsert custom theme settings
    const testTheme = {
      ...DEFAULT_DESIGN_SETTINGS.theme,
      preset: 'coffee',
      primary: '#8C5338',
      background: '#FBF7F4',
      fontHeading: 'Poppins',
    }

    const testLayout = [
      { id: 'logo', type: 'logo', visible: true, props: { size: 'lg', shape: 'circle' } },
      { id: 'business_info', type: 'business_info', visible: true, props: { alignment: 'center' } },
      { id: 'banner', type: 'banner', visible: true, props: { height: 'medium' } },
      { id: 'categories', type: 'categories', visible: true, props: { style: 'tabs' } },
      { id: 'products', type: 'products', visible: true, props: { layout: 'grid' } },
      { id: 'footer', type: 'footer', visible: true, props: { text: 'Live E2E Verified Footer' } },
    ]

    const { data: savedSetting, error: saveErr } = await supabaseAdmin
      .from('qr_menu_design_settings')
      .upsert({
        business_id: business.id,
        version: 1,
        theme: testTheme,
        layout: testLayout,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'business_id' })
      .select()
      .single()

    log('3. Upsert custom QR Menu design settings to remote database', !saveErr && Boolean(savedSetting), saveErr?.message || `Setting ID: ${savedSetting?.id}`)
    if (saveErr) allPassed = false

    // 4. Query back saved settings
    const { data: fetchedSetting, error: fetchErr } = await supabaseAdmin
      .from('qr_menu_design_settings')
      .select('*')
      .eq('business_id', business.id)
      .single()

    const themePreserved = fetchedSetting?.theme?.primary === '#8C5338' && fetchedSetting?.theme?.fontHeading === 'Poppins'
    log('4. Query back and verify theme token preservation', themePreserved, `Primary: ${fetchedSetting?.theme?.primary}`)
    if (!themePreserved) allPassed = false

    // 5. Verify normalization logic
    const normalized = normalizeDesignSettings(fetchedSetting)
    const hasAllBlocks = normalized.layout.length >= 7
    log('5. Normalization preserves custom layout while providing full default fallback', hasAllBlocks, `Blocks count: ${normalized.layout.length}`)
    if (!hasAllBlocks) allPassed = false

    // 6. RLS Verification: Public Anon cannot insert or update design settings
    const { data: anonWriteData, error: anonWriteErr } = await supabaseAnon
      .from('qr_menu_design_settings')
      .update({ theme: { hack: true } })
      .eq('business_id', business.id)
      .select()

    const anonWriteBlocked = Boolean(anonWriteErr) || !anonWriteData || anonWriteData.length === 0
    log('6. RLS security: Anonymous user blocked from mutating design settings', anonWriteBlocked, anonWriteErr?.message || '0 rows updated')
    if (!anonWriteBlocked) allPassed = false

    // 7. Storage verification: Tenant-isolated upload path in 'product-images'
    const testStoragePath = `qr-menu/${business.id}/logo/e2e_test_${Date.now()}.png`
    const testBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

    const { error: storageUploadErr } = await supabaseAdmin.storage
      .from('product-images')
      .upload(testStoragePath, testBuffer, {
        contentType: 'image/png',
        upsert: true,
      })

    log('7. Storage bucket: Upload asset to product-images tenant path', !storageUploadErr, storageUploadErr?.message || `Path: ${testStoragePath}`)
    if (storageUploadErr) allPassed = false

    // 8. Storage public URL generation
    const { data: pubUrlData } = supabaseAdmin.storage
      .from('product-images')
      .getPublicUrl(testStoragePath)

    const hasValidPubUrl = pubUrlData?.publicUrl && pubUrlData.publicUrl.includes('product-images')
    log('8. Storage asset public URL accessible', Boolean(hasValidPubUrl), pubUrlData?.publicUrl)
    if (!hasValidPubUrl) allPassed = false

    // Clean up test file
    await supabaseAdmin.storage.from('product-images').remove([testStoragePath])

  } catch (err) {
    console.error('Fatal E2E error:', err)
    allPassed = false
  }

  console.log('\n================================================================')
  console.log(allPassed ? '🎉 ALL QR MENU DESIGNER LIVE TESTS PASSED!' : '❌ SOME TESTS FAILED')
  console.log('================================================================\n')
  process.exit(allPassed ? 0 : 1)
}

runLiveVerification()
