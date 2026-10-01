BUG — DELETE HISTORY BUTTON NOT SHOWING IN PRODUCTION

URL:
https://bisnissehat.my.id/admin/activation-codes

SCREENSHOT:
Production UI shows REVOKED rows with:
Action = "Revoked"

Expected:
REVOKED / EXPIRED rows should show:
"Hapus"

IMPORTANT:
Do NOT create another migration.
Do NOT create duplicate RPC.
Do NOT change database schema unless verification proves migration 095/RPC is actually missing.

The previous implementation report claimed:
- migration 095_pro_activation_delete.sql exists
- admin_delete_pro_activation_code(...) exists
- REVOKED and EXPIRED can be deleted
- AdminActivationCodesPage.jsx has "Hapus" action
- delete modal exists

But production currently does NOT show the Hapus button.

==================================================
1. VERIFY LOCAL SOURCE
==================================================

Inspect:

src/pages/admin/AdminActivationCodesPage.jsx
src/lib/activationCodeService.js

Find the actual rendering logic for Action column.

Verify:
REVOKED -> Hapus
EXPIRED -> Hapus
UNUSED/ACTIVE -> Revoke
REDEEMED -> Sudah digunakan

Do not rely on the previous report.

==================================================
2. VERIFY DATABASE REMOTE
==================================================

Verify remote Supabase has:

public.admin_delete_pro_activation_code(
  p_code_id uuid,
  p_reason text DEFAULT 'Dihapus oleh super admin'
)

Verify migration 095 is applied remotely.

Verify RPC works for current SUPER_ADMIN.

Do NOT modify database if it already exists and passes verification.

==================================================
3. VERIFY PRODUCTION DEPLOYMENT MISMATCH
==================================================

Determine whether the production site is serving an older frontend build.

Compare:
- local AdminActivationCodesPage.jsx
- git HEAD
- deployed/production behavior

Check git status.
Check current branch.
Check latest commit.
Check whether the local implementation containing "Hapus" is committed/pushed.

If the fix exists locally but is not committed:
commit it.

If committed but not pushed:
push to the configured production branch.

Do NOT rewrite unrelated commits.

==================================================
4. IMPORTANT — ENVIRONMENT
==================================================

Do not expose:
- service_role
- Supabase secret
- client secret
- activation plaintext tokens

==================================================
5. PRODUCTION UI VERIFICATION
==================================================

After deployment/redeploy, open:

https://bisnissehat.my.id/admin/activation-codes

Verify a REVOKED row shows:

Hapus

Click Hapus.

Expected:
- destructive confirmation modal
- masked code
- recipient email
- status
- duration
- created date
- deletion reason required
- "Hapus Permanen"

After successful deletion:
- row disappears
- audit log remains
- refresh page
- row remains absent

==================================================
6. IF LOCAL UI ALSO DOES NOT SHOW HAPUS
==================================================

Then fix AdminActivationCodesPage.jsx using the EXISTING
admin_delete_pro_activation_code RPC/service.

Do NOT create a new delete architecture.

Expected action mapping:

status === 'revoked' || status === 'expired'
  => Hapus

status === 'unused' || status === 'active'
  => Revoke

status === 'redeemed'
  => Sudah digunakan

==================================================
7. TEST
==================================================

Run:

node --test src/__tests__/pro_activation_security.test.js
npm test
npm run lint
npm run build

Report exact results.

==================================================
FINAL REPORT
==================================================

Tell me clearly:

1. Was Hapus missing locally?
2. Was it only missing in production?
3. Was the cause an undeployed/unpushed frontend?
4. Was migration 095 already remote?
5. Was RPC already remote?
6. What commit was deployed?
7. Production URL verification result.
8. Tests/lint/build.

STOP after fixing this exact issue.
