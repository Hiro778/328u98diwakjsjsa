FIX ONLY — MAINTENANCE MODE GLOBAL FRONTEND GATE

CURRENT LIVE TEST:

Admin account:
- ppp
- SUPER_ADMIN
- /admin/settings
- maintenance_mode = ON

Normal user:
- Alby R.A.
- /dashboard
- STILL CAN ACCESS DASHBOARD

Therefore maintenance_mode is persisted correctly but GLOBAL USER ACCESS IS NOT BLOCKED.

IMPORTANT:
- Do NOT change the Admin Settings schema.
- Do NOT create another settings table.
- Do NOT modify QRIS/POS/payment logic.
- Do NOT modify AI enforcement.
- Do NOT modify announcement banner.
- Do NOT modify Admin RBAC.
- Do NOT remove the admin exemption.
- Do NOT create Express/Next backend/Redis.

TASK:

1. Inspect the existing maintenance_mode implementation.
2. Find the existing platform settings hook/provider/RPC and current app routing hierarchy.
3. Implement a GLOBAL React MaintenanceGate at the correct root level so it covers authenticated user routes.
4. Normal USER accounts:
   - when maintenance_mode=true
   - MUST NOT be able to access /dashboard or other normal application routes
   - MUST see a dedicated Maintenance Page.
5. ADMIN and SUPER_ADMIN:
   - MUST still be able to access /admin and /admin/settings while maintenance_mode=true.
6. The role decision MUST use the existing server-backed Admin RBAC/auth state.
   DO NOT trust localStorage or a client-editable role.
7. Public routes that are necessary for authentication/maintenance handling must remain accessible.
8. Do not create a redirect loop.
9. When maintenance_mode changes from true → false:
   - normal user must regain normal access
   - no logout required.
10. When maintenance_mode changes from false → true:
   - normal user currently inside /dashboard must be gated on the next settings refresh/focus/reload.
11. Keep the existing Announcement Banner working exactly as it is.

TESTS:
- maintenance OFF + normal user → dashboard accessible
- maintenance ON + normal user → dashboard blocked
- maintenance ON + normal user → Maintenance Page shown
- maintenance ON + SUPER_ADMIN → /admin accessible
- maintenance ON + SUPER_ADMIN → /admin/settings accessible
- maintenance OFF + normal user → dashboard accessible again
- direct navigation to /dashboard while maintenance ON → blocked
- direct navigation to another protected user route while ON → blocked
- no redirect loop
- announcement banner still works

SECURITY:
Also verify that maintenance_mode cannot be bypassed merely by manually typing a protected frontend URL.

IMPORTANT LIMITATION:
This task is specifically the global frontend/application gate.
Do NOT claim that it is a network/proxy-level global maintenance wall.

RUN:
1. Relevant maintenance/settings tests
2. npm run build
3. Report exact files changed
4. Report all test results
5. Report manual verification matrix

STOP.
