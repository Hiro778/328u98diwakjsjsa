CRITICAL AUTH BUG CONFIRMED — FIX GOTrue banned_until COMPATIBILITY

The root cause has now been identified.

Previous security hardening migrations 067 and 069 contain:

SET banned_until = 'infinity'::timestamptz

This causes Supabase GoTrue/Auth to fail when scanning auth.users.banned_until
into *time.Time.

Observed production symptom:

/auth/callback?error=server_error

with:

sql: Scan error on column index 1, name='banned_until':
unsupported Scan, storing driver.Value type string into type *time.Time

This is a CRITICAL AUTH REGRESSION.

STOP QRIS WORK.

==================================================
ROOT CAUSE
==================================================

The problematic statements are:

067_banned_user_zero_access.sql
→ admin_set_user_status()
→ banned_until = 'infinity'::timestamptz

069_comprehensive_account_access_hardening.sql
→ admin_set_user_status()
→ banned_until = 'infinity'::timestamptz

Do NOT edit migrations 067 or 069 because they are already deployed.

==================================================
PHASE 1 — LIVE DATA CLEANUP
==================================================

First inspect LIVE Supabase:

SELECT
  id,
  email,
  banned_until
FROM auth.users
WHERE banned_until = 'infinity'::timestamptz;

Determine exactly how many users currently contain infinity.

Then safely replace ONLY infinity values.

Use a concrete finite timestamptz value that GoTrue/lib/pq can scan into time.Time.

Preferred compatibility approach:

banned_until = '2099-12-31 23:59:59+00'::timestamptz

OR, if the existing security semantics require a longer finite horizon,
use a concrete finite timestamp that remains valid for PostgreSQL and
Go time.Time.

DO NOT use infinity again.

IMPORTANT:
Do not modify users whose banned_until is already NULL or a valid finite
timestamp.

Before mutation, report the number of affected rows.

After mutation verify:

SELECT count(*)
FROM auth.users
WHERE banned_until = 'infinity'::timestamptz;

Expected:
0

Then verify all affected users now have finite banned_until values.

==================================================
PHASE 2 — CORRECTIVE MIGRATION
==================================================

Create a NEW migration.

Do NOT modify:
067_banned_user_zero_access.sql
068_account_access_enforcement.sql
069_comprehensive_account_access_hardening.sql

Use the next available migration version according to the actual
migration directory.

The corrective migration must update the relevant admin status RPC/function
so future BAN/DELETE operations NEVER write:

'infinity'::timestamptz

For banned/deleted status:
use the same finite timestamp strategy verified in Phase 1.

For ACTIVE / UNBAN:
continue using:

banned_until = NULL

Preserve all existing security semantics.

==================================================
VERY IMPORTANT — PRESERVE BAN ENFORCEMENT
==================================================

Do NOT remove banned_until.

Do NOT remove admin ban functionality.

Do NOT weaken:
- banned access denial
- suspended access denial
- deleted access denial
- RLS
- admin RBAC
- SUPER_ADMIN restrictions
- account access enforcement

The only change is replacing the incompatible infinity sentinel
with a finite timestamp.

==================================================
PHASE 3 — FUNCTION VERIFICATION
==================================================

Inspect the final definition of:

public.admin_set_user_status

Verify there are ZERO occurrences of:

'infinity'::timestamptz

for banned_until.

Also search the entire migrations directory and source code for:

banned_until = 'infinity'
banned_until='infinity'
'infinity'::timestamptz

Any remaining occurrence related to auth.users.banned_until must be
reported and evaluated.

==================================================
PHASE 4 — AUTH / GOTRUE REGRESSION
==================================================

This is the most important verification.

After cleanup + migration:

1. Sign out.
2. Start a fresh authentication flow.
3. Test Google OAuth.
4. Complete /auth/callback.
5. Verify NO:

error=server_error

6. Verify NO:

Scan error on column ... banned_until

7. Verify authenticated session loads correctly.
8. Verify /dashboard loads.
9. Verify refresh works.
10. Verify token/session refresh works if testable.

Do not declare PASS based only on unit tests.

The actual OAuth callback must be verified.

==================================================
PHASE 5 — BAN SECURITY REGRESSION
==================================================

Verify:

ACTIVE:
- can authenticate
- can access dashboard

SUSPENDED:
- access denied according to existing enforcement

BANNED:
- access denied according to existing enforcement

UNBAN:
- access restored

CRITICAL:
Banning a user must no longer break authentication for OTHER users.

Test:
- banned user
- normal user
- SUPER_ADMIN

==================================================
PHASE 6 — ADMIN REGRESSION
==================================================

Run:

node --test \
  src/__tests__/admin_rbac.test.js \
  src/__tests__/admin_layout_overview.test.js \
  src/__tests__/admin_users.test.js \
  src/__tests__/admin_businesses.test.js

Run existing banned/security tests, including:

node --env-file=.env --test \
  src/__tests__/bannedUserSecurity.test.js

Also run any other auth/account-access tests discovered in the repo.

Expected:
ALL PASS.

==================================================
PHASE 7 — DATABASE VERIFICATION
==================================================

Verify remotely:

1. No auth.users row has banned_until = infinity.
2. admin_set_user_status no longer writes infinity.
3. banned_until remains nullable timestamptz.
4. Existing RLS remains enabled.
5. Existing admin RPC authorization remains intact.
6. SUPER_ADMIN restrictions remain intact.

Do not modify unrelated tables.

==================================================
PHASE 8 — BUILD
==================================================

Run:

npm run lint
npm run build

Report:
- lint errors
- lint warnings
- build status

Warnings may be pre-existing, but do not hide new warnings caused by
this fix.

==================================================
SCOPE LOCK
==================================================

DO NOT:
- implement QRIS Phase 3
- modify PublicMenuPage
- modify create_public_order
- modify payment_status
- modify Midtrans
- modify business_payment_settings
- modify qrisPaymentService.js
- modify Admin Stage 1–4 except the minimum auth RPC correction required
- weaken security
- edit historical migrations 067/068/069

==================================================
FINAL REPORT
==================================================

Must contain:

1. Number of users found with banned_until = infinity BEFORE cleanup.
2. Number cleaned.
3. Value used to replace infinity.
4. New migration filename/version.
5. Exact function corrected.
6. Confirmation no future ban operation writes infinity.
7. OAuth callback test result.
8. Normal login result.
9. Dashboard/session result.
10. Banned-user result.
11. Suspended-user result.
12. Unban result.
13. Admin/SUPER_ADMIN result.
14. Security test results.
15. Admin regression result.
16. Lint result.
17. Build result.
18. Any remaining issue.

Final status:

AUTH GOTRUE COMPATIBILITY FIX:
PASS / FAIL / BLOCKED

STOP.

DO NOT resume QRIS until this status is PASS.
