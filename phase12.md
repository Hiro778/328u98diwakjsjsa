IMPLEMENT AI INTEGRATION — PHASE 1 ONLY

PROJECT:
BisnisSehat

GOAL:
Integrasikan Open-Generative-AI sebagai external/self-hosted AI video
engine untuk BisnisSehat Creative Studio.

OFFICIAL REPOSITORY:
https://github.com/Anil-matcha/Open-Generative-AI

IMPORTANT:
JANGAN clone source Open-Generative-AI ke dalam source code BisnisSehat.

JANGAN mengganti authentication BisnisSehat.

JANGAN membuat sistem credit baru.

JANGAN bypass existing Pro entitlement.

JANGAN percaya plan/isPro/user_id/business_id dari client.

==================================================
ARCHITECTURE
==================================================

Browser
  ↓
BisnisSehat Creative Studio
  ↓ JWT
BisnisSehat Edge Function
  ↓ server-side
Open-Generative-AI
  ↓
AI provider

Open-Generative-AI harus diperlakukan sebagai external AI engine/service.

BisnisSehat tetap menjadi authority untuk:

- authentication
- user identity
- business ownership
- Pro entitlement
- AI credit balance
- credit deduction
- audit
- request ownership

==================================================
PHASE 0 — AUDIT EXISTING CREATIVE STUDIO
==================================================

Audit terlebih dahulu:

- Creative Studio pages
- creative services
- existing AI Edge Functions
- Gemini integration
- creative credits
- credit ledger
- existing Pro entitlement
- existing AI usage telemetry
- platform settings enable_ai_features
- existing loading/error states

Cari apakah sudah ada abstraction/provider layer.

JANGAN membuat duplicate architecture jika sudah ada.

==================================================
1. OPEN-GENERATIVE-AI SERVICE
==================================================

Jalankan Open-Generative-AI sebagai external service.

DO NOT expose provider credentials to browser.

Konfigurasi:

OPEN_GENERATIVE_AI_URL

atau nama environment variable yang sesuai existing architecture.

Credential harus server-side.

Jangan hardcode secret.

Jangan memasukkan secret ke VITE_*.

==================================================
2. BISNISSEHAT EDGE FUNCTION
==================================================

Buat adapter Edge Function jika belum tersedia:

creative-video-generate

atau gunakan existing Creative Studio generation boundary
jika architecture existing sudah memiliki endpoint yang tepat.

Flow:

request
→ verify JWT
→ verify active profile
→ resolve auth.userId
→ resolve business ownership
→ check enable_ai_features
→ check Pro entitlement jika video feature memang Pro
→ validate input
→ check credit availability
→ call Open-Generative-AI
→ record AI usage
→ deduct credit atomically
→ return sanitized result

Authorization HARUS terjadi sebelum provider call.

==================================================
3. ZERO TRUST CLIENT INPUT
==================================================

JANGAN percaya:

user_id
business_id
plan
isPro
credit_balance
credit_amount

dari request body.

Identity:

auth.uid()

Business:

server-side ownership lookup.

Entitlement:

existing server-side entitlement.ts.

Credit:

existing creative_credits / credit service.

==================================================
4. CREDIT SAFETY
==================================================

Jangan membuat client-side:

balance -= cost

Credit mutation harus server-side.

Pastikan:

- insufficient credit → reject
- provider failure → jangan kehilangan credit
- duplicate request → jangan double charge
- concurrent requests → tidak boleh menghasilkan negative balance
- successful generation → exactly one intended credit charge

Gunakan existing credit infrastructure.

Jika existing credit deduction belum mendukung transaksi provider dengan aman:

JANGAN membuat workaround client-side.

Report architecture gap sebelum memperluas scope.

==================================================
5. AI MODEL INPUT VALIDATION
==================================================

Validate server-side:

- prompt length
- model identifier
- resolution
- duration
- aspect ratio
- output format

Jangan izinkan arbitrary provider URL.

Jangan izinkan arbitrary API endpoint dari client.

Whitelist model/features yang memang didukung.

Reject malformed payload.

==================================================
6. PROVIDER ISOLATION
==================================================

Jika user:

FREE
BASIC
PRO expired
PRO cancelled

maka provider TIDAK BOLEH dipanggil jika feature mensyaratkan Pro.

Test provider mock:

unauthorized request
→ 403
→ provider call count = 0

Authorized Pro:

→ provider call allowed.

==================================================
7. AI USAGE TELEMETRY
==================================================

Gunakan existing ai_usage infrastructure.

Record minimal:

- user/profile
- business
- operation
- model
- input/output tokens jika provider menyediakan
- credits charged
- status
- request_id
- timestamp
- provider cost jika tersedia

Jangan record:

- API keys
- auth tokens
- raw secrets

Raw prompts hanya jika existing privacy policy/architecture memang
mengizinkannya.

Jangan menambah sensitive logging tanpa kebutuhan.

==================================================
8. ERROR HANDLING
==================================================

Provider errors harus dinormalisasi.

Contoh:

PROVIDER_NOT_CONFIGURED
PROVIDER_TIMEOUT
PROVIDER_RATE_LIMITED
PROVIDER_ERROR
INVALID_INPUT
INSUFFICIENT_CREDITS
FEATURE_DISABLED
PRO_REQUIRED

Jangan expose:

stack trace
provider credentials
internal URLs
database errors
service-role information

==================================================
9. RETRY / IDEMPOTENCY
==================================================

AI generation adalah expensive operation.

Implementasikan request_id/idempotency jika existing architecture
memungkinkan.

Concurrent duplicate request tidak boleh menghasilkan charge ganda.

Jangan melakukan automatic retry tanpa batas.

Gunakan timeout.

==================================================
10. FRONTEND
==================================================

Integrasikan ke existing Creative Studio UI.

JANGAN redesign Creative Studio.

Minimal:

- generate button
- loading state
- success state
- provider error state
- insufficient credit state
- Pro-required state

UI hanya memanggil BisnisSehat Edge Function.

Tidak boleh memanggil Open-Generative-AI langsung dari browser.

==================================================
11. PLATFORM SETTING
==================================================

Existing:

enable_ai_features

HARUS dihormati.

Jika false:

generation request ditolak server-side.

Jangan hanya hide button di frontend.

==================================================
12. SECURITY TEST
==================================================

Buat:

src/__tests__/aiVideoIntegrationSecurity.test.js

Minimal:

1. unauthenticated request denied
2. Free denied
3. Basic denied jika feature Pro
4. expired Pro denied
5. cancelled Pro denied
6. active Pro allowed
7. forged plan denied
8. forged user_id denied
9. forged business_id denied
10. cross-business denied
11. provider not called when unauthorized
12. feature flag disabled denied
13. insufficient credit denied
14. credit cannot be client-manipulated
15. provider failure does not incorrectly grant/deduct
16. duplicate request protection
17. concurrent generation protection
18. provider secret absent from frontend bundle
19. arbitrary provider URL denied
20. malformed model/input denied

==================================================
13. BUILD / REGRESSION
==================================================

Run:

npm test

Run existing:

- Step 1 security tests
- Step 2 security tests
- Creative Studio regression
- AI usage tests

Run:

npm run build

Do not modify unrelated failing tests merely to make them green.

==================================================
14. IMPORTANT SCOPE LOCK
==================================================

THIS PHASE ONLY:

AI VIDEO INTEGRATION FOUNDATION.

DO NOT:

- integrate Chatwoot
- modify OpenSEO
- redesign Creative Studio
- redesign Pricing
- modify subscription architecture
- modify manual activation architecture
- migrate Midtrans
- modify Admin Settings
- modify Maintenance Mode
- modify POS
- modify BEP
- modify Cash Flow
- modify Loan Simulation
- rewrite Open-Generative-AI source
- expose Open-Generative-AI publicly
- add Redis unless absolutely required and justified

If Open-Generative-AI cannot safely be integrated with the existing
BisnisSehat architecture, STOP and report the blocker instead of
creating an insecure workaround.

==================================================
FINAL REPORT
==================================================

Report:

1. Existing Creative Studio architecture
2. Open-Generative-AI integration architecture
3. Files changed
4. Edge Functions changed/created
5. Environment variables required
6. Entitlement enforcement
7. Credit flow
8. AI usage telemetry
9. Security tests
10. Test results
11. Build result
12. Known limitations
13. Deployment steps for Open-Generative-AI
14. STOP

Do not proceed to Phase 2.
