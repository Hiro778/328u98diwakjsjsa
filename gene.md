STEP 2 ONLY — AUDIT + HARDEN BISNISSEHAT AI VIDEO GENERATOR
USING OPEN-SOURCE OPEN-GENERATIVE-AI

IMPORTANT:
BisnisSehat sudah memiliki perubahan terkait AI video di working branch,
termasuk:

- src/pages/dashboard/marketing/CreativeStudioPage.jsx
- src/services/creativeStudioService.js
- supabase/functions/creative-video-generate/
- src/__tests__/aiVideoIntegrationSecurity.test.js

JANGAN membuat integrasi video generator kedua.

Gunakan existing implementation sebagai starting point.

==================================================
OPEN-SOURCE SOURCE
==================================================

Official repository:

https://github.com/Anil-matcha/Open-Generative-AI

Current project characteristics:
- open-source
- MIT
- self-hostable
- supports image/video generation
- uses Muapi.ai as unified API

DO NOT clone the entire Open-Generative-AI application into BisnisSehat.

BisnisSehat tetap menjadi:
- authentication owner
- business owner
- subscription/entitlement owner
- credit owner
- UI owner
- audit/security owner

Open-Generative-AI hanya menjadi external generation engine/service.

==================================================
1. AUDIT EXISTING IMPLEMENTATION
==================================================

Inspect:

- CreativeStudioPage.jsx
- creativeStudioService.js
- creative-video-generate Edge Function
- existing AI credit service
- creative_credits
- credit_ledger
- subscription entitlement
- platform settings
- auth.ts
- entitlement.ts
- AI security tests
- existing Creative Studio UI

Determine EXACTLY:

Browser
→ BisnisSehat
→ Supabase Edge Function
→ Open-Generative-AI / Muapi
→ generated result

Do not guess.

==================================================
2. SECURITY ARCHITECTURE
==================================================

Browser MUST NOT directly contain:

- Muapi secret
- provider API key
- Open-Generative-AI server credential
- service-role key

All provider credentials remain server-side.

Expected:

Browser
  ↓ authenticated Supabase session
creative-video-generate
  ↓ validate auth
  ↓ validate business ownership
  ↓ validate entitlement
  ↓ validate AI feature flag
  ↓ validate credit availability
  ↓ call generation provider
  ↓ normalize result
Browser

==================================================
3. TENANT ISOLATION
==================================================

User A must NOT be able to generate video using:

- User B business_id
- User B credits
- User B subscription
- User B generation history

Never trust business_id from client.

Derive/verify ownership server-side.

Test IDOR explicitly.

==================================================
4. CREDIT SYSTEM
==================================================

Use existing BisnisSehat AI credit system.

Do NOT create another credit balance.

Before generation:

- verify entitlement
- verify AI feature flag
- verify sufficient credits

Credit deduction MUST NOT be controlled by client.

If generation fails before successful provider acceptance:
- do not permanently consume credits unless existing accounting
  explicitly requires reservation/consumption

If provider succeeds:
- record generation/credit usage atomically according to existing
  architecture.

Prevent duplicate charging caused by:
- double click
- request retry
- network retry
- duplicate request_id

Inspect existing creative credit architecture before changing anything.

==================================================
5. PROVIDER ABSTRACTION
==================================================

Do not tightly couple BisnisSehat UI to one provider response format.

Normalize provider response into a stable internal format such as:

{
  success,
  generationId,
  status,
  outputUrl,
  thumbnailUrl,
  duration,
  metadata
}

Use actual fields supported by the existing implementation.

Do not invent provider fields.

==================================================
6. AI VIDEO UX
==================================================

Creative Studio should support the existing video workflow without
duplicating Open-Generative-AI's entire UI.

BisnisSehat owns the UX.

At minimum verify:

- prompt input
- generation start
- loading state
- success state
- failure state
- retry
- output preview
- output URL handling
- credit information

Do not redesign the entire Creative Studio.

==================================================
7. PLATFORM SETTINGS
==================================================

Respect existing:

enable_ai_features

If AI feature is disabled:

- generation request rejected server-side
- UI shows appropriate disabled state
- no provider request occurs
- no credits consumed

Do not rely only on hiding the button.

==================================================
8. SECURITY TESTS
==================================================

Run/update:

aiVideoIntegrationSecurity.test.js

Must test:

1. unauthenticated request rejected
2. invalid session rejected
3. cross-business business_id rejected
4. missing entitlement rejected
5. AI feature disabled rejected
6. insufficient credits rejected
7. malformed provider response handled
8. provider timeout handled
9. provider 4xx handled
10. provider 5xx handled
11. provider secret never returned to client
12. service-role key never returned
13. client cannot choose arbitrary credit amount
14. client cannot choose arbitrary business
15. duplicate request does not double-charge
16. failed generation does not incorrectly consume credits
17. successful generation records usage correctly

==================================================
9. PRODUCTION BUNDLE SECRET CHECK
==================================================

After build:

grep production bundle for:

MUAPI
API_KEY
SERVICE_ROLE
SECRET
Bearer
provider credentials

Provider secrets must NOT appear in browser bundle.

==================================================
10. BUILD
==================================================

Run:

npm test
npm run build
npm run lint

Do not fix unrelated legacy tests.

==================================================
11. SCOPE LOCK
==================================================

DO NOT:

- clone Open-Generative-AI into BisnisSehat
- replace Creative Studio
- create another credit system
- create another subscription system
- change Pro price
- change Basic price
- modify Midtrans
- modify maintenance mode
- modify Chatwoot
- modify OpenSEO
- add Redis/Kafka
- expose provider secrets
- use service-role key in browser

==================================================
FINAL REPORT
==================================================

Report:

1. EXISTING VIDEO INTEGRATION STATUS
2. OPEN-GENERATIVE-AI CONNECTION METHOD
3. PROVIDER/API USED
4. SERVER-SIDE SECRET STORAGE
5. AUTHENTICATION
6. BUSINESS TENANT ISOLATION
7. ENTITLEMENT CHECK
8. AI FEATURE FLAG
9. CREDIT DEDUCTION
10. IDEMPOTENCY / DOUBLE-CHARGE PROTECTION
11. TEST RESULTS
12. BUILD
13. LINT
14. PRODUCTION SECRET SCAN
15. FILES CHANGED

STOP AFTER STEP 2.
