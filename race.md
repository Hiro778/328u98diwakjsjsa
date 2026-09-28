STOP QRIS IMPLEMENTATION TEMPORARILY.

We have discovered a runtime regression on:
http://localhost:5173/admin/businesses

Browser error:
"Unexpected Application Error!
useAuth must be used within AuthProvider"

Stack:
useAuth
→ RequireAuth
→ App.jsx

This MUST be fixed and verified before any QRIS implementation begins.

TASK: Diagnose and fix ONLY the AuthProvider regression.

STRICT SCOPE LOCK:
- Do NOT implement QRIS.
- Do NOT create migration 070.
- Do NOT create business_payment_settings.
- Do NOT modify Midtrans.
- Do NOT modify orders/payment_status.
- Do NOT modify storage policies.
- Do NOT modify Admin Stage 1-4 database schema.
- Do NOT refactor unrelated authentication code.
- Do NOT weaken RequireAuth or remove authentication guards as a workaround.
- Do NOT duplicate AuthProvider.
- Preserve existing user-facing authentication behavior.

INVESTIGATION:
1. Read the current src/App.jsx completely.
2. Read src/context/AuthContext.jsx.
3. Read src/components/RequireAuth.jsx.
4. Trace the actual React provider hierarchy.
5. Determine exactly why RequireAuth is rendering outside AuthProvider.
6. Compare with the previous working provider structure if available in git/history.
7. Check whether a recent App.jsx/admin route change accidentally moved routes outside AuthProvider.

REQUIRED FIX:
RequireAuth and every component using useAuth must render inside the existing AuthProvider.

The fix must preserve:
- normal authenticated routes
- public routes
- /admin
- /admin/businesses
- /admin/businesses/:id
- RequireAdmin behavior
- existing auth session handling
- banned/suspended account access enforcement already implemented

IMPORTANT:
Do NOT solve this by changing useAuth to silently return null.
Do NOT remove RequireAuth.
Do NOT bypass AuthProvider.
Do NOT make admin routes publicly accessible.

VERIFICATION:
1. Run the relevant auth/admin tests.
2. Run:
   node --test src/__tests__/admin_rbac.test.js src/__tests__/admin_layout_overview.test.js src/__tests__/admin_users.test.js src/__tests__/admin_businesses.test.js
3. Run npm run lint.
4. Run npm run build.
5. Start/use the local app and verify:
   - /admin
   - /admin/businesses
   - /admin/businesses/:id
   - a normal authenticated user-facing route
   - a public route
6. Confirm there is no "useAuth must be used within AuthProvider" runtime error.
7. Confirm admin route protection still works.

If any test/build/runtime issue appears outside this scope, report it but do not expand scope.

FINAL REPORT MUST INCLUDE:
- exact root cause
- exact file(s) changed
- exact fix
- tests passed
- lint result
- build result
- manual route verification
- whether AuthProvider/RequireAuth hierarchy is now correct

STOP after this fix.
DO NOT proceed to QRIS implementation until explicitly instructed.
