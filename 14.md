GAS. LANJUTKAN EKSEKUSI SEKARANG.

Jangan berhenti di dokumentasi/referensi.
Jangan bertanya lagi apakah perlu dilanjutkan.

Kerjakan langsung sesuai 13.md / Phase 3 yang sudah diberikan:

1. Audit implementation OpenSEO yang sekarang.
2. Implement/fix SSRF protection.
3. Implement/fix input limits.
4. Pastikan JWT server-side.
5. Pastikan business ownership / tenant isolation.
6. Pastikan authorization terjadi SEBELUM provider call.
7. Pastikan OPENSEO/DataForSEO credentials hanya server-side.
8. Pastikan provider timeout 10 detik dengan AbortController.
9. Implement error normalization:
   - PROVIDER_TIMEOUT
   - PROVIDER_NOT_CONFIGURED
   - PROVIDER_ERROR
   - MALFORMED_PROVIDER_RESPONSE
10. Validasi response provider.
11. Audit SEO history tenant isolation.
12. Audit provider abuse/rate boundary tanpa menambah Redis.
13. Buat/extend:
    src/__tests__/seoOpenSeoLiveE2E.test.js

WAJIB test minimal 20 kasus yang sudah ditentukan Phase 3:
- auth
- cross-business
- forged business_id
- oversized keywords
- invalid domain
- localhost
- private IP
- metadata endpoint
- redirect SSRF
- provider not called ketika invalid/unauthorized
- timeout
- 5xx
- malformed response
- valid keyword research
- valid SERP
- history isolation
- secret exposure
- service-role exposure
- entitlement
- input validation

LIVE E2E:

Jika OPENSEO_URL/API key/DataForSEO credentials SUDAH tersedia:
→ lakukan real provider smoke test.

Jika BELUM tersedia:
→ JANGAN fabricate success.
→ tulis:
LIVE PROVIDER E2E: BLOCKED — CONFIGURATION MISSING

Tetap jalankan seluruh mocked/security tests.

Setelah implementation:

npm test
npm run build

Jangan memperbaiki unrelated pre-existing tests hanya supaya hijau.

JANGAN:
- clone OpenSEO
- redesign SEO UI
- ubah Pricing
- ubah subscription
- ubah manual activation
- kerjakan AI
- kerjakan Chatwoot
- kerjakan Security Step 3
- tambah Redis tanpa kebutuhan

STOP setelah implementation + tests + build + final report.

FINAL REPORT harus jelas:
- Files changed
- Security fixes
- 20 test results
- Live E2E result
- npm test
- build
- secrets/config yang diperlukan
- remaining limitations

EKSEKUSI SEKARANG, JANGAN BERHENTI DI CHECKLIST.
