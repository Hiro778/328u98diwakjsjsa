Fix Maintenance Screen UI only.

Current issue:
When maintenance_mode=true, normal users see:
"Akses Administrator →"

This should NOT be shown to normal users.

Requirements:
1. Remove the "Akses Administrator →" link/button from MaintenanceScreen for normal users.
2. Normal users during maintenance should only see:
   - maintenance icon
   - "Pemeliharaan Sistem"
   - maintenance message
   - support/help information if already present
3. Do NOT expose /admin navigation or administrator entry point on the maintenance screen.
4. Keep existing server-backed admin RBAC unchanged.
5. ADMIN and SUPER_ADMIN must still be able to access /admin and /admin/settings normally while maintenance_mode=true.
6. Do not modify database schema, maintenance logic, announcement banner, QRIS, POS, payment, subscription, AI, or other unrelated systems.
7. Run relevant tests and npm run build.

Final report:
- what was changed
- confirmation normal-user maintenance screen has no admin link
- confirmation admin access still works
- tests
- build result
