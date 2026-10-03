STEP 4 ONLY — INTEGRATE CHATWOOT CUSTOMER SUPPORT
WITHOUT CLONING CHATWOOT INTO BISNISSEHAT

Official project:
https://github.com/chatwoot/chatwoot

Official documentation:
https://github.com/chatwoot/docs

Chatwoot is an open-source, self-hosted customer support platform with
website chat and APIs.

IMPORTANT ARCHITECTURE:

BisnisSehat remains the owner of:
- authentication
- business/user identity
- subscription
- admin RBAC
- support entitlement/settings
- existing support_tickets
- existing Help Center
- security/audit

Chatwoot is an external support service.

DO NOT clone Chatwoot source code into BisnisSehat.

DO NOT replace the existing support system blindly.

==================================================
1. AUDIT EXISTING SUPPORT SYSTEM FIRST
==================================================

Inspect actual current implementation:

- CustomerSupportWidget.jsx
- HelpCenterPage.jsx
- supportConfig.js
- support_tickets table
- adminSupportService.js
- AdminSupportPage.jsx
- AdminSupportDetailPage.jsx
- support-related RPCs
- platform settings
- support email/phone/operating hours settings
- existing support tests

Determine:

WHAT EXISTS TODAY
vs
WHAT CHATWOOT SHOULD ADD

Do not delete existing support functionality during this step.

==================================================
2. CHATWOOT DEPLOYMENT ARCHITECTURE
==================================================

Chatwoot must run as a separate service.

Preferred conceptual deployment:

support.bisnissehat.my.id
        ↓
Chatwoot
        ↓
its own database/storage/services

BisnisSehat:

bisnissehat.my.id
        ↓
Chatwoot widget/API

DO NOT run the full Chatwoot Rails application inside the Vite
BisnisSehat application.

DO NOT copy Chatwoot source into src/.

If Chatwoot is not currently deployed:
DO NOT pretend that live integration exists.

Implement the integration boundary and report:

CHATWOOT_DEPLOYMENT = NOT CONFIGURED

instead of fabricating success.

==================================================
3. WEBSITE CHAT WIDGET
==================================================

Audit the existing CustomerSupportWidget.

If appropriate, integrate the official Chatwoot website widget.

The widget must use:

- actual Chatwoot base URL
- actual Website Inbox token

Credentials/configuration must be handled correctly.

DO NOT hardcode secrets into source.

A public website inbox token may be exposed as required by the Chatwoot
widget architecture, but:

- never expose Chatwoot agent API keys
- never expose admin API tokens
- never expose server credentials
- never expose Supabase service_role

If widget configuration is unavailable:
render the existing BisnisSehat support UI gracefully.

No crash.

==================================================
4. DO NOT DESTROY EXISTING SUPPORT TICKETS
==================================================

Existing:

support_tickets

must remain.

Existing Admin Support pages must remain functional.

DO NOT migrate/delete support_tickets in this step.

Chatwoot should complement the current ticket/help system.

Suggested conceptual split:

FAQ / Help Center
        ↓
Chatwoot live conversation
        ↓
Existing support ticket for structured support cases

But use the actual existing UX and avoid unnecessary redesign.

==================================================
5. USER IDENTITY
==================================================

If authenticated user opens Chatwoot:

use the actual authenticated BisnisSehat identity where Chatwoot's
supported widget APIs allow it.

Potential identity data:

- name
- email
- business identifier as a custom attribute if appropriate

Do NOT send:

- Supabase JWT
- access token
- service role key
- payment secrets
- subscription secrets
- private database data

Do not trust Chatwoot client-side identity to authorize BisnisSehat
operations.

Chatwoot is support communication, NOT an authorization system.

==================================================
6. BUSINESS TENANT ISOLATION
==================================================

If business_id is sent as Chatwoot metadata/custom attribute:

- derive it from authenticated BisnisSehat state
- do not allow arbitrary business_id query parameters
- never expose another business's internal data

Do not use Chatwoot custom attributes as a replacement for BisnisSehat
RLS.

BisnisSehat authorization remains authoritative.

==================================================
7. ADMIN SUPPORT
==================================================

Current Admin Support should remain.

Do not replace:

/admin/support
/admin/support/:id

unless the existing architecture explicitly requires it.

If useful, add a safe link/button:

"Open Chatwoot"

for authorized admins.

Do NOT embed Chatwoot's admin dashboard inside BisnisSehat unless there
is a clear supported integration.

Admin credentials stay inside Chatwoot.

==================================================
8. SUPPORT SETTINGS
==================================================

Existing platform settings include:

support_email
support_phone
support_operating_hours

Do not create duplicate settings.

Audit how CustomerSupportWidget consumes these settings.

Expected behavior:

Chatwoot available:
→ live chat available

Chatwoot unavailable:
→ existing email/help/ticket support remains available

The app must degrade gracefully.

==================================================
9. MAINTENANCE MODE
==================================================

Respect the existing BisnisSehat maintenance architecture.

Do not accidentally make Chatwoot widget bypass application security.

Determine whether Chatwoot should remain available during maintenance.

For this task:

- do not modify maintenance_mode implementation
- do not modify MaintenanceGate
- report current behavior

==================================================
10. PLATFORM SETTINGS / FEATURE FLAG
==================================================

If there is an existing support feature flag:

use it.

If no support feature flag exists:

DO NOT invent a new database setting unless absolutely required.

Existing platform settings should remain the source of truth.

==================================================
11. CHATWOOT API
==================================================

Only use Chatwoot REST API from a server-side environment when privileged
operations are needed.

Never put:

CHATWOOT_API_KEY
CHATWOOT_ACCESS_TOKEN
CHATWOOT_ADMIN_TOKEN

inside VITE_* variables or browser source.

If the browser only needs the Website Inbox widget:

use the public widget configuration mechanism.

Do not expose agent/admin credentials.

==================================================
12. WEBHOOKS
==================================================

Audit whether Chatwoot webhooks are useful for existing support tickets.

DO NOT implement two-way synchronization automatically unless the
current support schema and business requirements clearly support it.

If implementing a webhook:

- verify webhook signature/authentication according to Chatwoot's
  supported mechanism
- validate payload
- prevent replay/duplicate processing
- never trust business_id supplied blindly
- log safely
- never expose secrets

If webhook integration is not necessary yet:
leave it out and report it.

==================================================
13. SECURITY TESTS
==================================================

Create/update focused tests.

Must cover:

1. Chatwoot widget configuration does not expose agent API key
2. service credentials not in production bundle
3. Supabase service role not exposed
4. arbitrary business_id cannot be injected into privileged operations
5. unauthenticated user cannot perform privileged Chatwoot API calls
6. admin-only operations remain admin-only
7. existing support ticket RLS remains intact
8. existing admin support authorization remains intact
9. malformed Chatwoot response handled
10. Chatwoot unavailable does not crash BisnisSehat
11. Chatwoot timeout handled
12. widget configuration missing does not crash app
13. user identity sent to Chatwoot comes from authenticated BisnisSehat
14. sensitive BisnisSehat data is not sent as Chatwoot metadata

==================================================
14. PRODUCTION SECRET SCAN
==================================================

After build:

search dist/ for:

CHATWOOT_API_KEY
CHATWOOT_ACCESS_TOKEN
CHATWOOT_ADMIN_TOKEN
SUPABASE_SERVICE_ROLE_KEY
SERVICE_ROLE
Bearer
SECRET

Actual secrets MUST NOT appear.

A public Chatwoot website inbox token may appear if the official widget
requires it, but document that clearly.

==================================================
15. MOBILE
==================================================

Check Chatwoot widget on:

360px
390px
412px

It must not create horizontal overflow.

Do not redesign the existing mobile layout.

==================================================
16. BUILD + TEST
==================================================

Run:

npm test
npm run build
npm run lint

Run focused support/Chatwoot tests.

If Chatwoot server is not configured:

DO NOT fake live E2E.

Report:

CHATWOOT LIVE E2E = BLOCKED
Reason = Chatwoot instance / Website Inbox configuration missing

Unit/security tests must still pass.

==================================================
17. SCOPE LOCK
==================================================

DO NOT:

- clone Chatwoot into BisnisSehat
- rewrite Help Center
- delete support_tickets
- delete Admin Support
- create another support database
- create another auth system
- modify Admin RBAC
- modify subscription
- modify pricing
- modify AI credits
- modify Midtrans
- modify OpenSEO
- modify AI Video
- modify maintenance mode
- expose Chatwoot admin credentials
- add Redis/Kafka unnecessarily
- create duplicate support settings

==================================================
FINAL REPORT
==================================================

Report:

1. EXISTING SUPPORT ARCHITECTURE
2. CHATWOOT INTEGRATION METHOD
3. CHATWOOT DEPLOYMENT STATUS
4. WIDGET STATUS
5. AUTHENTICATED USER IDENTITY STATUS
6. BUSINESS TENANT ISOLATION
7. EXISTING support_tickets STATUS
8. EXISTING ADMIN SUPPORT STATUS
9. CHATWOOT API CREDENTIAL SECURITY
10. WEBHOOK STATUS
11. GRACEFUL FALLBACK STATUS
12. SECURITY TEST RESULTS
13. LIVE E2E RESULT
14. PRODUCTION SECRET SCAN
15. BUILD
16. LINT
17. FILES CHANGED
18. REMAINING LIMITATIONS

STOP AFTER STEP 4.
