URGENT BUG FIX ONLY — FIX SettingsProvider HIERARCHY REGRESSION

BisnisSehat sekarang mengalami production crash:

Unexpected Application Error!

[usePlatformSettings] Must be used inside <SettingsProvider>.
Ensure SettingsProvider wraps the component tree above this component.

Stack:
usePlatformSettings
→ MaintenanceGate / related settings consumer
→ React Router tree

PROBLEM:
Setelah perubahan MaintenanceGate / maintenance-mode access control, ada component yang memanggil usePlatformSettings() tetapi berada DI LUAR SettingsProvider.

TARGET:
Perbaiki provider hierarchy dengan benar.
Jangan workaround dengan try/catch.
Jangan mengubah usePlatformSettings agar diam-diam bekerja tanpa provider.
Jangan disable maintenance mode.

==================================================
1. AUDIT ACTUAL TREE FIRST
==================================================

Cari dan baca:

- src/App.jsx
- entry point main.jsx / main.tsx / index.jsx yang sebenarnya
- SettingsProvider
- usePlatformSettings
- MaintenanceGate
- AuthProvider/AuthContext
- RequireAuth
- RequireAdmin
- AdminLayout
- RouterProvider / createBrowserRouter / routes
- komponen lain yang menggunakan usePlatformSettings()

Gunakan grep/search untuk:

usePlatformSettings(
<SettingsProvider
<MaintenanceGate
AuthProvider
RequireAuth
RequireAdmin

Jangan menebak struktur.

Identifikasi EXACTLY component pertama yang memanggil
usePlatformSettings() di luar provider.

==================================================
2. FIX PROVIDER HIERARCHY
==================================================

Pastikan setiap consumer usePlatformSettings() berada di bawah:

<SettingsProvider>
  ...
</SettingsProvider>

Idealnya hierarchy tetap sederhana seperti:

<ThemeProvider>
  <AuthProvider>
    <SettingsProvider>
      <RouterProvider ... />
    </SettingsProvider>
  </AuthProvider>
</ThemeProvider>

ATAU struktur setara yang sesuai dengan architecture aktual.

IMPORTANT:

Jangan memindahkan SettingsProvider ke tempat yang menyebabkan:

SettingsProvider
  → router
  → component
  → SettingsProvider

Jangan membuat nested duplicate SettingsProvider tanpa alasan.

Jangan membuat circular dependency.

==================================================
3. MAINTENANCE GATE
==================================================

MaintenanceGate memang membutuhkan usePlatformSettings(),
jadi MaintenanceGate HARUS berada di bawah SettingsProvider.

Expected conceptual hierarchy:

SettingsProvider
    ↓
MaintenanceGate
    ↓
Router / authenticated application

Tetapi sesuaikan dengan architecture aktual.

Jika MaintenanceGate harus membungkus RouterProvider dan RouterProvider
sendiri menyebabkan route-level consumers berada di luar provider,
gunakan wrapper component yang benar.

Contoh pola yang BOLEH digunakan:

function AppShell() {
  return (
    <SettingsProvider>
      <MaintenanceGate>
        <RouterProvider router={router} />
      </MaintenanceGate>
    </SettingsProvider>
  );
}

Hanya gunakan pola ini jika cocok dengan architecture aktual.

==================================================
4. PRESERVE AUTH + ADMIN RBAC
==================================================

Jangan merusak hierarchy yang sudah benar:

AuthProvider
RequireAuth
RequireAdmin
AdminLayout

Admin/SUPER_ADMIN tetap harus bisa:

/admin
/admin/settings
/dashboard

ketika maintenance_mode=true.

Normal user tetap harus terkena maintenance pada protected application
routes ketika maintenance_mode=true.

Pricing/purchase routes yang sebelumnya ditetapkan public/purchase-accessible
tetap jangan ikut rusak.

Jangan mengubah subscription/payment logic.

==================================================
5. IMPORTANT — AVOID LOADING RACE
==================================================

Pastikan SettingsProvider tidak mengembalikan consumer sebelum context
tersedia.

Expected:

SettingsProvider
  → initializes settings
  → provides context
  → children render

MaintenanceGate
  → consumes settings only after provider exists.

Saat settings masih loading:
- render loading state
- jangan throw
- jangan redirect prematurely

==================================================
6. CHECK ALL usePlatformSettings CONSUMERS
==================================================

Setelah hierarchy diperbaiki, cari SEMUA:

usePlatformSettings()

Pastikan semuanya berada di bawah SettingsProvider.

Jangan hanya memperbaiki component pertama yang muncul di stack trace.

Potential consumers include:
- MaintenanceGate
- DashboardLayout
- PublicMenuPage
- AuthPage
- AnnouncementBanner
- CustomerSupportWidget
- AI feature components
- settings-related components

Jangan menghapus penggunaan hook hanya untuk membuat build hijau.

==================================================
7. PRODUCTION REPRODUCTION
==================================================

Reproduce the actual failure:

Production currently crashes with:

[usePlatformSettings] Must be used inside <SettingsProvider>

Verify after fix:

1. Open /
2. Open /pricing
3. Login
4. Open /dashboard
5. Open /admin
6. Open /admin/settings
7. Refresh each page directly
8. maintenance_mode=true
9. test admin
10. test normal user

There must be NO:

"Must be used inside <SettingsProvider>"

==================================================
8. TESTS
==================================================

Add/update focused regression test proving:

A. usePlatformSettings consumer under SettingsProvider
B. MaintenanceGate renders without context error
C. SettingsProvider + MaintenanceGate can mount together
D. AuthProvider still works
E. Admin route still works
F. Pricing route still works
G. maintenance ON behavior still works
H. maintenance OFF behavior still works

If existing tests already cover these, extend them rather than duplicating
the entire suite.

==================================================
9. BUILD + LINT
==================================================

Run:

npm test
npm run build

Also run lint if configured.

Production build MUST succeed.

After build, verify the generated bundle does not contain this runtime
error caused by provider hierarchy.

==================================================
10. SCOPE LOCK
==================================================

ONLY fix the SettingsProvider/provider hierarchy regression.

DO NOT:

- create database migration
- modify platform_settings schema
- modify maintenance_mode database logic
- modify subscription prices
- modify Rp130.000
- modify Rp35.000
- modify payment logic
- modify Midtrans
- modify QRIS
- modify admin RBAC
- modify AI credits
- redesign UI
- change unrelated responsive code
- introduce another state-management library
- introduce Redux/Zustand/etc.
- create a second settings architecture

Reuse the existing SettingsProvider and usePlatformSettings.

==================================================
11. FINAL REPORT
==================================================

Report:

1. EXACT ROOT CAUSE
2. ACTUAL PROVIDER HIERARCHY BEFORE
3. ACTUAL PROVIDER HIERARCHY AFTER
4. FILES CHANGED
5. ALL usePlatformSettings CONSUMERS CHECKED
6. ADMIN/SUPER_ADMIN — PASS/FAIL
7. NORMAL USER MAINTENANCE — PASS/FAIL
8. /pricing — PASS/FAIL
9. /admin/settings — PASS/FAIL
10. npm test result
11. build result
12. lint result
13. CONFIRM NO OTHER LOGIC WAS CHANGED

STOP after this bug fix.
