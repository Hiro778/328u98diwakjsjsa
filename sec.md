SECURITY FIX — STEP 1 ONLY
DO NOT INTEGRATE ANY NEW THIRD-PARTY TOOL.

This is a remediation task based on the completed post-implementation security audit.

DO NOT modify unrelated features.

==================================================
CRITICAL: SERVER-SIDE PRO ENTITLEMENT
==================================================

Fix these Edge Functions:

1. creative-generate-copy
2. creative-generate-prd
3. creative-revise-prd

Current vulnerability:
Authenticated Basic users can call these Edge Functions directly because
server-side Pro entitlement is missing.

Required:

Every protected function MUST perform server-side entitlement validation
before any paid/protected operation.

Use the existing shared entitlement implementation.

Do NOT trust:
- React state
- URL
- localStorage
- client-supplied plan
- client-supplied isPro
- client-supplied subscription status

The server must derive entitlement from Supabase/auth/database.

Expected:

FREE → BLOCKED
BASIC → BLOCKED
PRO active → ALLOWED
PRO expired → BLOCKED
PRO cancelled/expired → BLOCKED

Return a safe authorization error.

Do not leak subscription/payment details.

==================================================
HIGH: MARKETPLACE FUNCTIONS
==================================================

Find all marketplace-* Edge Functions.

The audit identified 7 marketplace functions without server-side
isProUser() enforcement.

For every marketplace function:

- authenticate request
- derive authenticated user
- resolve business ownership
- verify active Pro entitlement server-side
- reject Basic/Free/expired/cancelled users
- prevent arbitrary business_id access

Do not trust business_id supplied by the client.

Do not duplicate entitlement logic if the existing shared helper can be reused.

==================================================
SECURITY REQUIREMENTS
==================================================

Test direct HTTP/Edge Function invocation.

Tests MUST prove:

1. Basic cannot call creative-generate-copy
2. Basic cannot call creative-generate-prd
3. Basic cannot call creative-revise-prd
4. Free cannot call them
5. Expired Pro cannot call them
6. Cancelled Pro cannot call them
7. Active Pro can call them
8. Basic cannot call marketplace functions
9. Free cannot call marketplace functions
10. Expired Pro cannot call marketplace functions
11. Active Pro can call marketplace functions
12. Cross-business access is rejected
13. Client-side plan manipulation does not bypass protection
14. Client-supplied isPro=true does not bypass protection
15. Client-supplied business_id cannot bypass ownership

==================================================
IMPORTANT
==================================================

Do NOT fix the following yet:

- subscription cancellation state
- DEFAULT 'pro'
- verify_payment Basic amount bug
- credit ledger UNIQUE constraint
- cross-user subscription RPC probing
- Basic cancellation path

Those will be handled in separate remediation steps.

Do NOT integrate OpenSEO, Chatwoot, or AI Video.

==================================================
VALIDATION
==================================================

Run:

relevant security tests
npm test
npm run build

Do not modify unrelated tests merely to make them pass.

If an existing test conflicts with the intended security behavior,
investigate it instead of weakening the security implementation.

FINAL REPORT:

- exact files changed
- exact Edge Functions protected
- entitlement mechanism used
- business ownership validation
- security tests
- npm test result
- build result
- remaining known vulnerabilities

Do not claim production-ready unless the tests actually verify it.
