IMPLEMENT PRO ACTIVATION CODE SYSTEM — REPLACE MIDTRANS PRO SUBSCRIPTION CHECKOUT

OBJECTIVE
Replace the current Midtrans-based PRO subscription purchase/checkout flow with a secure manual activation-code system.

NEW BUSINESS FLOW:

ADMIN generates a PRO activation code
→ Admin gives the code manually to customer
→ Customer opens PRO activation page
→ Customer submits activation code
→ Server securely validates the code
→ If valid, activate the customer's PRO subscription
→ Code becomes permanently redeemed
→ Customer gets PRO entitlement for the configured duration.

IMPORTANT:
This is a SECURITY-SENSITIVE authentication/credential-like system.

Do NOT implement code validation in frontend.
Do NOT store plaintext activation codes in the database.
Do NOT expose activation-code rows through normal Supabase client queries.
Do NOT rely on obscurity.
Do NOT create predictable sequential codes.
Do NOT create short numeric-only codes.

==================================================
1. FIRST: AUDIT EXISTING PAYMENT/SUBSCRIPTION SYSTEM
==================================================

Before modifying anything:

Inspect:
- subscriptions
- subscription_payments
- existing entitlement logic
- existing admin subscription management
- current PRO pricing UI
- current Midtrans subscription flow
- current audit logging
- current Admin RBAC
- existing security/RLS migrations

Understand the existing subscription schema and reuse it where appropriate.

Do NOT blindly create duplicate subscription tables.

Preserve:
- existing PRO entitlement semantics
- existing subscription history
- existing admin subscription management
- existing audit logs
- existing tenant isolation

The activation-code system should become a new authorized way to grant PRO entitlement.

==================================================
2. ACTIVATION CODE SCHEMA
==================================================

Create a migration for:

public.pro_activation_codes

Suggested fields:

id uuid primary key
code_hash text not null unique
plan text not null
duration_days integer not null
expires_at timestamptz null
redeemed_at timestamptz null
redeemed_by uuid null references auth.users(id)
redeemed_business_id uuid null references businesses(id)
created_at timestamptz not null default now()
created_by uuid null references auth.users(id)
metadata jsonb not null default '{}'::jsonb

Constraints:

plan must currently support PRO only.

duration_days must be positive.

redeemed_at / redeemed_by / redeemed_business_id represent permanent redemption.

A code must NEVER be reusable.

==================================================
3. CODE GENERATION SECURITY
==================================================

Activation codes MUST be generated using a cryptographically secure random generator.

Minimum target:
128 bits of entropy.

Preferred human-readable format:

BS-PRO-XXXX-XXXX-XXXX-XXXX-XXXX

The visible code must contain enough random entropy.

DO NOT derive codes from:
- user ID
- email
- timestamp
- sequential IDs
- business ID
- order ID
- predictable hashes
- Math.random()

Generate the code server-side only.

The plaintext code may be returned ONLY once to the authorized admin immediately after creation.

Do not store plaintext code.

Store only a cryptographic hash/HMAC representation.

==================================================
4. ADMIN GENERATION
==================================================

Add admin functionality:

/admin/activation-codes

Only ADMIN / SUPER_ADMIN may access.

Allow:

Generate PRO activation code
Duration:
- 30 days
- optionally configurable only from safe predefined values

Display generated plaintext code once.

Show:
- plan
- duration
- created date
- status
- redeemed date
- redeemed user/business when redeemed

NEVER display code plaintext after creation.

Instead display:

BS-PRO-••••-••••-••••-••••-••••

or a safe partial identifier.

Do not allow admin to retrieve plaintext codes from the database later.

Every creation must generate an audit log.

==================================================
5. SERVER-SIDE REDEMPTION
==================================================

Create a SECURITY DEFINER server-side RPC or secure Edge Function:

redeem_pro_activation_code(p_code)

Requirements:

1. Require authenticated user.
2. Resolve user's authorized business using existing business ownership logic.
3. Normalize code safely.
4. Hash/HMAC the submitted code.
5. Find matching code.
6. Verify:
   - code exists
   - plan = PRO
   - not redeemed
   - not expired
7. Atomically redeem the code.
8. Create/update the user's/business subscription using the EXISTING subscription model.
9. Set:
   plan = pro
   status = active
   started_at = now()
   expires_at = now() + duration_days
10. Set:
   redeemed_at
   redeemed_by
   redeemed_business_id
11. Write admin/system audit event.
12. Return success.

The entire redemption must be atomic.

Use row locking / transactional protection so two simultaneous requests cannot redeem the same code.

Exactly ONE request may succeed.

The second concurrent request must fail.

==================================================
6. DO NOT ALLOW CLIENT-SIDE SUBSCRIPTION ESCALATION
==================================================

Do NOT allow the frontend to directly update:

subscriptions.plan
subscriptions.status
subscriptions.expires_at

for this flow.

The client can only request:

redeem code

Server decides whether entitlement changes.

Verify direct REST manipulation is rejected.

Test:

authenticated user attempts:

UPDATE subscriptions
SET plan = 'pro'

Must be rejected.

Also test:

UPDATE subscriptions
SET status = 'active'

Must be rejected.

Also test cross-business subscription manipulation.

==================================================
7. ANTI-BRUTE-FORCE
==================================================

This is mandatory.

Activation-code redemption must be protected against automated guessing.

Implement rate limiting for failed redemption attempts.

At minimum use multiple dimensions:

- authenticated user
- IP when available at the server/Edge Function layer
- session/request fingerprint where appropriate

Do NOT rely only on frontend throttling.

Suggested policy:

5 failed attempts:
5 minute cooldown

10 failed attempts:
30 minute cooldown

20 failed attempts:
temporary longer block

Make thresholds configurable in server-side code/config.

Successful redemption resets the relevant failure counter.

DO NOT reveal whether:
- code exists
- code was previously redeemed
- code expired
- code belongs to another user

Use a generic response:

"Kode aktivasi tidak valid atau sudah tidak dapat digunakan."

Do not return raw database errors.

==================================================
8. ANTI-ENUMERATION
==================================================

Do not expose:

- activation code ID
- code_hash
- exact expiration reason
- redemption owner
- database errors
- whether a code exists

Normal users must never be able to query:

pro_activation_codes

directly.

RLS:

authenticated users:
NO SELECT
NO INSERT
NO UPDATE
NO DELETE

Admin access must go through secure admin RPCs.

Public/anon:
NO access.

Revoke unnecessary EXECUTE privileges.

==================================================
9. ACTIVATION CODE STATUS
==================================================

Admin list should show:

ACTIVE
REDEEMED
EXPIRED

But status must be calculated server-side.

Do not expose code_hash.

Admin may see:
- created_at
- duration
- redeemed_at
- redeemed user/business
- creator

Admin cannot recover plaintext activation code after creation.

==================================================
10. SUBSCRIPTION SEMANTICS
==================================================

Reuse existing subscription entitlement logic.

Do not create a second definition of "PRO".

Existing entitlement:

plan = pro
status = active
expires_at > now()

must continue to be authoritative unless audit proves otherwise.

If user already has active PRO:

Choose and implement ONE safe documented behavior:

Option A:
extend existing expires_at by duration_days

OR

Option B:
reject activation while active PRO exists.

Prefer extending existing PRO expiry if this matches the current subscription business model, but verify the existing schema/service before deciding.

Do not silently overwrite a longer existing expiration.

Example:

Current expires_at:
2026-10-15

30-day code:

new expires_at:
2026-11-14

NOT:

2026-10-29

unless the current entitlement model explicitly requires that.

==================================================
11. REMOVE MIDTRANS PRO CHECKOUT
==================================================

After the activation system is verified:

Remove/disable ONLY the Midtrans PRO subscription checkout UI and flow.

Do NOT blindly delete Midtrans infrastructure because Midtrans may still be used elsewhere.

Audit first.

Preserve any Midtrans flow that is still legitimately used.

The PRO pricing page should become:

PRO
Rp130.000 / month

"Sudah punya kode aktivasi?"
[Masukkan Kode Aktivasi]

Button:

AKTIVASI PRO

Do not show a broken Midtrans Snap modal.

==================================================
12. ADMIN SECURITY
==================================================

Admin routes must use existing:

RequireAuth
RequireAdmin
is_admin()

Do not implement frontend-only admin authorization.

All sensitive admin operations must be server-side authorized.

No service-role key in browser.

No secret in VITE_* variables.

==================================================
13. AUDIT LOGGING
==================================================

Create audit events for:

ACTIVATION_CODE_CREATED
ACTIVATION_CODE_REDEEMED
ACTIVATION_CODE_REDEMPTION_FAILED
ACTIVATION_CODE_RATE_LIMITED
PRO_ACTIVATED

Do not log the plaintext activation code.

Do not log code_hash.

Safe metadata only:

{
  plan: "pro",
  duration_days: 30,
  activation_code_id: "...",
  business_id: "...",
  user_id: "..."
}

==================================================
14. SECURITY TESTS
==================================================

Create comprehensive tests.

Required:

A. Valid code
→ PRO activated

B. Invalid code
→ rejected

C. Wrong/random code repeatedly
→ rate limited

D. Expired code
→ rejected

E. Redeemed code
→ rejected

F. Same code concurrent redemption
→ exactly ONE success

G. Anonymous redemption
→ rejected

H. Normal authenticated user cannot read activation table

I. Normal authenticated user cannot create activation codes

J. Normal authenticated user cannot modify activation codes

K. Normal authenticated user cannot modify subscription directly

L. Cross-business redemption manipulation
→ rejected

M. Admin can generate code

N. Non-admin cannot generate code

O. Plaintext code never appears in database

P. code_hash never exposed through normal API

Q. code cannot be reconstructed from predictable values

R. response does not distinguish:
   nonexistent
   expired
   redeemed

S. brute-force test with many requests
→ rate limiter blocks attempts

T. subscription expiration is correct

U. active PRO extension behavior is correct

V. audit log created

W. no secrets in frontend bundle

==================================================
15. SECURITY AUDIT
==================================================

Run static searches for:

- plaintext activation codes
- hardcoded PRO codes
- sequential code generation
- Math.random()
- code_hash exposed to client
- activation table direct SELECT from frontend
- direct subscription mutation
- service role in frontend
- secret keys in dist

Run:

npm test
npm run lint
npm run build

Also run targeted security tests.

==================================================
16. SCOPE LOCK
==================================================

DO NOT modify:

- QRIS merchant-direct ordering
- merchant_process_order
- merchant_complete_order
- POS payment authority
- order chat
- QRIS security
- Admin RBAC foundation
- existing subscription schema unless strictly required
- unrelated admin stages
- Footer/social links
- Creative Studio
- inventory
- financial calculators

Midtrans:
DO NOT delete generic Midtrans infrastructure until audit confirms which flows still use it.

Only remove/disable the PRO checkout dependency.

==================================================
17. FINAL REPORT
==================================================

Report:

1. Existing subscription schema discovered
2. New migration
3. New RPC/Edge Function
4. Code generation entropy
5. Code storage method
6. Rate-limit design
7. Admin UI
8. User activation UI
9. Subscription activation behavior
10. Midtrans PRO flow removed/disabled
11. Remaining Midtrans flows, if any
12. Security test count
13. Brute-force test result
14. Concurrent redemption result
15. RLS/IDOR result
16. npm test result
17. lint result
18. build result
19. git diff/status

STOP after implementation and verification.
Do not deploy production secrets.
Do not create or expose a real production activation code in the report.
