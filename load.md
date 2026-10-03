IMPLEMENT STEP 1 ONLY — INTEGRATE OPENSEO INTO BISNISSEHAT

GOAL:
Add a real SEO Optimizer capability to BisnisSehat using OpenSEO as an external/self-hosted SEO engine.

OFFICIAL REPOSITORY:
https://github.com/every-app/open-seo

IMPORTANT:
DO NOT clone OpenSEO source into the BisnisSehat Vite/React source tree.

DO NOT copy the OpenSEO application into src/.

Use OpenSEO as a separate service/integration.

==================================================
EXISTING BISNISSEHAT STACK
==================================================

- Vite
- React
- Supabase
- Supabase Edge Functions
- existing authentication
- existing business ownership
- existing Admin RBAC
- existing subscription/entitlement
- existing credit system

Preserve all existing architecture.

==================================================
PHASE 1 — AUDIT ONLY
==================================================

Before modifying code:

1. Inspect current BisnisSehat:
   - SEO Optimizer route/page
   - existing SEO services
   - existing AI/Edge Functions
   - existing subscription entitlement
   - existing credit system
   - business/profile ownership
   - existing environment configuration

2. Inspect OpenSEO:
   - current release
   - API/MCP/service interfaces
   - self-hosting requirements
   - DataForSEO requirements
   - authentication
   - data persistence
   - API endpoints if available
   - license
   - deployment requirements

3. Determine the smallest stable integration boundary.

DO NOT modify BisnisSehat during this audit phase.

Report findings first.

==================================================
PHASE 2 — INTEGRATION
==================================================

After confirming architecture:

Create a BisnisSehat SEO Optimizer integration layer.

Desired flow:

Browser
 ↓
BisnisSehat SEO Optimizer UI
 ↓
authenticated BisnisSehat backend/Edge Function
 ↓
OpenSEO
 ↓
DataForSEO

CRITICAL:
DataForSEO credentials MUST remain server-side.

Never expose:
DATAFORSEO_LOGIN
DATAFORSEO_PASSWORD
API keys
OpenSEO credentials

through:
- VITE_
- React source
- browser requests
- localStorage
- public Supabase tables

==================================================
FEATURES
==================================================

Expose only stable OpenSEO capabilities that can be safely integrated:

- keyword research
- rank tracking
- competitor insights
- site audit
- backlinks
- SEO visibility

Do not attempt to integrate every OpenSEO feature.

Start with the smallest useful vertical slice.

==================================================
BUSINESS ISOLATION
==================================================

Every SEO project must be associated with:

business_id

A user must only access SEO data belonging to their business.

No IDOR.

Do not trust business_id from the browser without server-side ownership validation.

==================================================
ENTITLEMENT
==================================================

Respect existing BisnisSehat subscription/entitlement system.

Do not invent another subscription system.

If SEO Optimizer is currently Free:
preserve existing free entitlement.

If currently Pro:
preserve Pro entitlement.

Do not change pricing.

==================================================
CREDITS
==================================================

Do NOT charge credits unless the existing SEO feature is explicitly credit-based.

Do not silently introduce credit consumption.

If external DataForSEO has a cost:
that cost must remain an infrastructure/provider cost unless a separate product decision is made.

==================================================
UI
==================================================

Use existing BisnisSehat design system.

Do not copy OpenSEO branding.

The user should see:

BisnisSehat
→ SEO Optimizer

not:

OpenSEO

Preserve mobile responsiveness.

==================================================
SECURITY
==================================================

Test:

- unauthenticated request
- authenticated normal user
- cross-business IDOR
- invalid business_id
- missing credentials
- provider failure
- provider timeout
- malformed provider response
- rate limiting where appropriate
- secret exposure in production bundle

==================================================
NO OVERENGINEERING
==================================================

Do NOT:
- add Redis
- add Kafka
- add another database unless OpenSEO absolutely requires it
- rewrite Supabase
- rewrite existing SEO UI unnecessarily
- clone OpenSEO
- copy its database schema into BisnisSehat
- modify unrelated modules

==================================================
VALIDATION
==================================================

Run:

npm test
npm run build

and relevant SEO tests.

Also verify:

grep/search production bundle for:
DATAFORSEO
API keys
passwords
secret credentials

No secrets may appear in client bundle.

==================================================
STOP CONDITION
==================================================

STOP after STEP 1.

Do NOT integrate Chatwoot or Open-Generative-AI yet.

FINAL REPORT:
- OpenSEO version/commit used
- integration architecture
- files changed
- API boundary
- authentication
- business isolation
- entitlement
- provider credentials
- tests
- build
- known limitations

Do not claim "bug free".

Only report verified results.
