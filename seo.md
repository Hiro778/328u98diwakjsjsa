STEP 3 ONLY — AUDIT + HARDEN BISNISSEHAT SEO
USING OPEN-SOURCE OPENSEO

Official repository:
https://github.com/every-app/open-seo

OpenSEO current capabilities:
- Keyword Research
- Rank Tracking
- Competitor Insights
- Backlinks
- Site Audits
- AI Visibility
- MCP / agent workflows

License:
MIT

IMPORTANT:
Do NOT clone OpenSEO's UI/application into BisnisSehat.

BisnisSehat remains the owner of:
- authentication
- business ownership
- subscription entitlement
- feature access
- UI
- tenant isolation
- audit/security

OpenSEO is an external SEO engine/service.

==================================================
1. AUDIT EXISTING SEO IMPLEMENTATION FIRST
==================================================

Existing likely files include:

- src/pages/dashboard/marketing/SeoOptimizerPage.jsx
- src/lib/seoService.js
- supabase/functions/seo-engine/
- seoOpenSeoIntegration.test.js
- seoOpenSeoLiveE2E.test.js
- entitlement/auth helpers
- platform settings

Read the actual implementation.

DO NOT create a second SEO architecture.

Determine the actual current flow:

Browser
→ BisnisSehat SEO UI
→ Supabase Edge Function / backend
→ OpenSEO
→ DataForSEO

If implementation differs, report the actual architecture before changing it.

==================================================
2. OPENSEO INTEGRATION
==================================================

Use OpenSEO as the SEO engine.

Do NOT copy the OpenSEO source tree into src/.

Do NOT expose OpenSEO/DataForSEO credentials to browser.

Provider credentials must remain server-side.

Expected server-side configuration may include:

OPENSEO_URL
OPENSEO_API_KEY
DATAFORSEO_API_KEY

Use only the credentials actually required by the existing deployment.

Do not invent environment variables if the existing integration already
uses another secure configuration.

==================================================
3. DATAFORSEO
==================================================

OpenSEO's official documentation states that SEO data requires a
DataForSEO API key.

Therefore:

Browser MUST NOT call DataForSEO directly.

Never expose:

DATAFORSEO_API_KEY

to the client.

Expected:

Browser
→ BisnisSehat Edge Function
→ OpenSEO
→ DataForSEO

If OpenSEO is self-hosted, its DataForSEO credential belongs only to the
OpenSEO server environment.

==================================================
4. AUTHENTICATION
==================================================

Every BisnisSehat SEO request must validate the authenticated Supabase
user.

Unauthenticated:
→ reject

Invalid/expired JWT:
→ reject

Banned/suspended user:
→ reject according to existing auth policy

Do not trust frontend authentication state.

==================================================
5. BUSINESS TENANT ISOLATION
==================================================

This is CRITICAL.

The client must NOT be able to use another business's SEO data.

Test:

User A:
business_id = A

attempt:
business_id = B

Expected:
403 ACCESS_DENIED

Also verify project/domain ownership if the SEO implementation stores
projects/domains.

Never trust arbitrary business_id supplied by browser.

Derive or verify ownership server-side.

==================================================
6. ENTITLEMENT
==================================================

Audit the ACTUAL current pricing model.

Do not assume SEO is free.

Use existing subscription/feature entitlement architecture.

If current product rules say SEO is:

- Free
- Basic
- Pro

preserve those exact rules.

Do NOT silently change pricing or entitlement.

If the existing SEO page currently says:

"SEO Optimizer (Unlimited)"

verify whether that is still authoritative after the new
two-tier pricing model.

If there is a contradiction:
REPORT IT rather than inventing a new entitlement rule.

==================================================
7. SUPPORTED WORKFLOWS
==================================================

Integrate only workflows that OpenSEO actually supports and that fit the
existing BisnisSehat SEO UI.

Potential workflows:

1. Keyword Research
2. Rank Tracking
3. Competitor Insights
4. Backlinks
5. Site Audit
6. AI Visibility

Do NOT expose every OpenSEO capability automatically.

Start with the workflows already represented in BisnisSehat.

Do not redesign the entire SEO page.

==================================================
8. PROVIDER RESPONSE NORMALIZATION
==================================================

OpenSEO/DataForSEO response formats must not leak directly into UI logic.

Create/use a stable BisnisSehat response contract.

Example concept:

{
  success,
  data,
  provider,
  requestId,
  error
}

Use the actual existing service contract if already present.

Normalize:

- provider errors
- timeouts
- malformed JSON
- empty results
- rate limits
- upstream 4xx
- upstream 5xx

Do not expose raw provider secrets or internal stack traces.

==================================================
9. SSRF / URL SECURITY
==================================================

SEO tools may accept URLs/domains.

Audit the existing SSRF protection.

The client must NOT be able to make the server fetch arbitrary internal
resources such as:

127.0.0.1
localhost
169.254.169.254
private RFC1918 ranges
internal hostnames
file://
javascript:
data:
other dangerous schemes

Use the existing ssrf.ts if already implemented.

Do not create a second SSRF implementation.

Test malicious URLs.

==================================================
10. RATE LIMITING / ABUSE
==================================================

Audit existing rate limiting.

SEO operations can be expensive because DataForSEO is pay-as-you-go.

Prevent uncontrolled repeated requests from a single user/business.

At minimum handle:

- rapid duplicate requests
- provider rate limit
- upstream 429
- request timeout

Do not add Redis unless the existing architecture genuinely requires it.

Prefer the existing Edge Function / database mechanisms.

==================================================
11. DATA OWNERSHIP
==================================================

If SEO results/projects are persisted:

verify:

- owner/business_id
- RLS
- cross-business isolation
- delete/update isolation
- no client-controlled ownership transfer

If results are not persisted:
report that clearly.

Do not create a new persistence layer unless required.

==================================================
12. API KEY / SECRET SECURITY
==================================================

Production browser bundle MUST NOT contain:

DATAFORSEO_API_KEY
OPENSEO_API_KEY
OPENSEO_SECRET
SUPABASE_SERVICE_ROLE_KEY

Search the generated dist bundle.

Any real secret found:
STOP and report.

==================================================
13. AI VISIBILITY
==================================================

If AI Visibility uses an additional AI provider:

audit its credentials separately.

Do not accidentally expose:

OpenRouter
Gemini
OpenAI
Anthropic
or other provider secrets.

If AI Visibility is not currently wired:
do not implement it in this step unless existing code already provides
the integration.

Report it as unavailable.

==================================================
14. LIVE E2E
==================================================

If environment credentials are configured, run the existing:

seoOpenSeoLiveE2E.test.js

Verify:

1. authenticated request
2. keyword research
3. malformed input
4. provider timeout/error
5. cross-business rejection
6. no secret leakage
7. normalized response

If credentials are NOT configured:
DO NOT fake a successful live test.

Report:

LIVE E2E = BLOCKED
Reason = missing provider configuration

Unit/security tests must still run.

==================================================
15. SECURITY TESTS
==================================================

seoOpenSeoIntegration.test.js must cover:

1. unauthenticated request
2. invalid JWT
3. banned/suspended user
4. cross-business IDOR
5. invalid business
6. unauthorized project/domain
7. malformed input
8. malicious URL / SSRF
9. provider timeout
10. provider 4xx
11. provider 429
12. provider 5xx
13. malformed provider response
14. empty provider response
15. secret not returned
16. service-role key not returned
17. DataForSEO key not returned
18. duplicate request handling
19. rate limiting/abuse handling
20. entitlement enforcement

==================================================
16. UI
==================================================

Keep existing BisnisSehat SEO UI.

Do NOT replace it with OpenSEO's UI.

The user should feel like they are using:

"BisnisSehat SEO Optimizer"

not a separate third-party product.

Keep existing:
- navigation
- theme
- auth
- business selector
- entitlement UI
- loading/error states

Only wire the actual engine underneath.

==================================================
17. PLATFORM SETTINGS
==================================================

Respect existing:

enable_ai_features

ONLY if the current SEO implementation classifies the operation as an
AI feature.

Do not incorrectly block ordinary keyword/rank/audit operations because
of the AI feature flag.

Use the actual existing feature architecture.

==================================================
18. BUILD + TEST
==================================================

Run:

npm test
npm run build
npm run lint

Also run focused:

seoOpenSeoIntegration.test.js
seoOpenSeoLiveE2E.test.js

Do not fix unrelated legacy test failures.

==================================================
19. PRODUCTION SECRET SCAN
==================================================

After build:

search dist/ for:

DATAFORSEO
OPENSEO
SERVICE_ROLE
API_KEY
SECRET
Bearer

Configuration variable names may appear if harmless.

Actual secret values MUST NOT.

==================================================
20. SCOPE LOCK
==================================================

DO NOT:

- clone OpenSEO into BisnisSehat
- replace SEO UI
- modify pricing
- modify Basic/Pro prices
- modify subscription architecture
- modify AI credit architecture
- modify Midtrans
- modify maintenance mode
- modify Chatwoot
- add Redis/Kafka
- create duplicate SEO service
- expose DataForSEO credentials
- expose OpenSEO credentials
- create another auth system
- create another business ownership system

==================================================
FINAL REPORT
==================================================

Report:

1. EXISTING SEO IMPLEMENTATION
2. OPENSEO CONNECTION METHOD
3. OPENSEO DEPLOYMENT URL/TYPE
4. DATAFORSEO LOCATION
5. AUTHENTICATION
6. BUSINESS TENANT ISOLATION
7. ENTITLEMENT
8. SUPPORTED SEO WORKFLOWS
9. SSRF PROTECTION
10. RATE LIMITING
11. DATA PERSISTENCE / OWNERSHIP
12. PROVIDER ERROR HANDLING
13. SECURITY TEST RESULTS
14. LIVE E2E RESULT
15. BUILD
16. LINT
17. PRODUCTION SECRET SCAN
18. FILES CHANGED
19. REMAINING LIMITATIONS

STOP AFTER STEP 3.
