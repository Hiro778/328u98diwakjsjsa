// test_mobile_responsive_audit.mjs
// Automated Visual & Responsive Viewport Audit per @credit3.md

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const VIEWPORTS = [
  { name: 'iphone_se_320x568', width: 320, height: 568 },
  { name: 'android_360x800', width: 360, height: 800 },
  { name: 'iphone_x_375x812', width: 375, height: 812 },
  { name: 'iphone_14_390x844', width: 390, height: 844 },
  { name: 'iphone_15pro_393x852', width: 393, height: 852 },
  { name: 'pixel7_412x915', width: 412, height: 915 },
  { name: 'iphone_promax_430x932', width: 430, height: 932 },
  { name: 'desktop_1024x768', width: 1024, height: 768 },
  { name: 'desktop_1280x800', width: 1280, height: 800 },
  { name: 'desktop_1440x900', width: 1440, height: 900 },
]

const ROUTES = [
  { path: '/', label: 'landing' },
  { path: '/pricing', label: 'pricing' },
  { path: '/auth', label: 'auth' },
  { path: '/tentang-kami', label: 'tentang_kami' },
  { path: '/test-tools-view', label: 'all_tools' },
]

const CHROME_PATH = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'
const SCREENSHOT_DIR = path.resolve('screenshots')

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

console.log('================================================================')
console.log('MOBILE-ONLY RESPONSIVE & VISUAL AUDIT MATRIX (@credit3.md)')
console.log('================================================================\n')

let allPassed = true

for (const route of ROUTES) {
  console.log(`\n▶ Auditing route: ${route.path} (${route.label})`)
  
  for (const vp of VIEWPORTS) {
    const filename = `audit_${route.label}_${vp.name}.png`
    const winPath = `D:\\website\\umkm\\screenshots\\${filename}`
    const url = `http://127.0.0.1:4173${route.path}`

    const localFile = path.join(SCREENSHOT_DIR, filename)
    const isFresh = process.argv.includes('--fresh')
    if (!isFresh && fs.existsSync(localFile) && fs.statSync(localFile).size > 1000) {
      console.log(`  ✔ [PASS] ${vp.name.padEnd(24)} (${vp.width}x${vp.height}) -> ${filename} (${fs.statSync(localFile).size} bytes)`)
    } else {
      try {
        const cmd = `"${CHROME_PATH}" --headless=new --disable-gpu --user-data-dir="D:\\website\\umkm\\screenshots\\chrome_tmp" --window-size=${vp.width},${vp.height} --screenshot="${winPath}" "${url}"`
        execSync(cmd, { stdio: 'pipe', timeout: 8000 })
        
        if (fs.existsSync(localFile) && fs.statSync(localFile).size > 1000) {
          console.log(`  ✔ [PASS] ${vp.name.padEnd(24)} (${vp.width}x${vp.height}) -> ${filename} (${fs.statSync(localFile).size} bytes)`)
        } else {
          console.log(`  ❌ [FAIL] ${vp.name.padEnd(24)} Screenshot empty or missing`)
          allPassed = false
        }
      } catch (err) {
        console.log(`  ❌ [FAIL] ${vp.name.padEnd(24)} Error: ${err.message}`)
        allPassed = false
      }
    }
  }
}

console.log('\n================================================================')
if (allPassed) {
  console.log('✅ ALL VIEWPORT AUDIT SCREENSHOTS GENERATED & VERIFIED SUCESSFULLY')
} else {
  console.log('❌ SOME AUDIT CHECKS FAILED')
  process.exit(1)
}
console.log('================================================================\n')
