IMPLEMENT ONLY — DELETE HISTORY PRO ACTIVATION CODES

CONTEXT:
Admin page:
  /admin/activation-codes

Current UI already has:
- Code / Identifier
- Email
- Paket & Durasi
- Status
- Dibuat Tanggal
- Dibuat Oleh
- Digunakan Oleh
- Tanggal Redeem
- Action

Current problem:
- REVOKED/expired activation-code history cannot be permanently deleted.
- UI only shows "Revoked" for revoked records.
- User explicitly wants the activation-code history to be deletable.

IMPORTANT:
This is an intentional change from the previous "no hard delete" behavior.
Implement permanent deletion ONLY for SUPER_ADMIN.

DO NOT:
- delete redeemed subscription
- delete user account
- delete subscription history
- delete payment history
- delete admin_audit_logs
- cascade into unrelated tables
- expose service_role key
- implement client-only authorization
- weaken existing activation-code security
- change redeem flow
- change email binding
- change QR generation
- change activation-code format
- change existing PRO entitlement logic

==================================================
1. AUDIT EXISTING IMPLEMENTATION FIRST
==================================================

Inspect:
- public.pro_activation_codes
- existing RLS policies
- existing admin_revoke_pro_activation_code(...)
- existing admin_generate_pro_activation_code(...)
- existing get_admin_pro_activation_codes(...)
- activationCodeService.js
- AdminActivationCodesPage.jsx
- existing Admin RBAC / is_super_admin()
- existing admin_audit_logs
- existing activation security tests

Do NOT create duplicate tables/functions.

==================================================
2. DATABASE DELETE RPC
==================================================

Create a new migration, next available migration number.

Create:

admin_delete_pro_activation_code(
  p_code_id uuid,
  p_reason text DEFAULT 'Dihapus oleh super admin'
)

Requirements:

- SECURITY DEFINER
- SET search_path = ''
- server-side auth.uid()
- require public.is_super_admin()
- reject non-super-admin
- reject unauthenticated
- SELECT ... FOR UPDATE before deletion
- code must exist
- prevent accidental deletion of ACTIVE/UNUSED codes unless explicitly intended
- ALLOW permanent deletion only for:
    REVOKED
    EXPIRED
  unless existing schema has another clearly equivalent terminal status
- REDEEMED codes MUST NOT be deletable through this RPC
- mandatory non-empty reason
- normalize/validate reason
- delete exactly one row by id
- return structured JSON result

Example behavior:

REVOKED:
  DELETE allowed

EXPIRED:
  DELETE allowed

UNUSED / ACTIVE:
  reject with clear error

REDEEMED:
  reject with clear error

Non-super-admin:
  reject

Unknown ID:
  reject

==================================================
3. AUDIT LOG — IMPORTANT
==================================================

Do NOT delete the audit log describing the deletion.

Before/after deletion, write an audit event such as:

PRO_ACTIVATION_CODE_DELETED

Include safe metadata:
- code_id
- masked_code
- target_email
- status_before_delete
- duration_days
- created_at
- created_by
- deletion_reason

NEVER store plaintext activation code in audit metadata.

The audit record must survive the deletion.

==================================================
4. RLS / GRANTS
==================================================

Do NOT simply add a broad DELETE policy for authenticated users.

Prefer:
- direct DELETE remains unavailable to normal authenticated users
- deletion is exposed only through the SECURITY DEFINER RPC
- RPC performs the SUPER_ADMIN check

Verify:
- anon cannot call RPC
- normal authenticated user cannot call RPC
- ADMIN cannot call RPC
- SUPER_ADMIN can call RPC

Do not expose service_role credentials to browser.

==================================================
5. FRONTEND SERVICE
==================================================

Update existing activationCodeService.js.

Add:

deleteProActivationCode(codeId, reason)

Call:

admin_delete_pro_activation_code

Normalize errors into safe UI messages.

Do not expose raw Postgres errors.

==================================================
6. ADMIN UI
==================================================

Update:

AdminActivationCodesPage.jsx

For each row:

REVOKED:
  show button:
  "Hapus"

EXPIRED:
  show button:
  "Hapus"

UNUSED / ACTIVE:
  keep:
  "Revoke"

REDEEMED:
  show:
  "Sudah digunakan"

Do NOT show Delete for:
- active/unused
- redeemed

==================================================
7. DELETE CONFIRMATION MODAL
==================================================

When SUPER_ADMIN clicks Hapus:

Show destructive confirmation modal:

Title:
"Hapus riwayat kode?"

Display:
- masked code
- recipient email
- status
- duration
- created date

Warning:
"Data kode ini akan dihapus permanen dan tidak dapat dipulihkan."

Require reason.

Example:
"Kode sudah tidak diperlukan"

Require explicit confirmation.

Button:
"Hapus Permanen"

Cancel:
"Batal"

After success:
- close modal
- refresh list
- show success toast

No full-page reload required.

==================================================
8. SECURITY / ADVERSARIAL TESTS
==================================================

Add/update tests covering:

1. anonymous cannot delete
2. normal user cannot delete
3. ADMIN cannot delete
4. SUPER_ADMIN can delete REVOKED
5. SUPER_ADMIN can delete EXPIRED
6. SUPER_ADMIN cannot delete REDEEMED
7. SUPER_ADMIN cannot delete ACTIVE/UNUSED
8. invalid code_id rejected
9. missing reason rejected
10. IDOR:
    superadmin can only delete explicitly requested code_id
11. audit log remains after deletion
12. plaintext activation code never appears in audit log
13. subscription remains untouched
14. redeemed user's subscription remains untouched
15. deleting one code does not delete other codes
16. double-delete is safely rejected

==================================================
9. LIVE DATABASE VERIFICATION
==================================================

Against the linked/remote Supabase database:

Create a disposable test activation code.

Verify:

REVOKE
→ DELETE
→ SELECT confirms row no longer exists

Verify audit log still exists.

Verify:
- subscription tables unchanged
- other activation codes unchanged

Verify direct table DELETE from normal authenticated role is denied.

Verify ADMIN cannot call delete RPC.

Verify SUPER_ADMIN can call it.

==================================================
10. UI VERIFICATION
==================================================

Open:

/admin/activation-codes

Verify:

REVOKED:
  Hapus button visible

EXPIRED:
  Hapus button visible

ACTIVE/UNUSED:
  Revoke button visible

REDEEMED:
  no delete button

Click Hapus:
  confirmation modal
  reason required
  successful deletion
  row disappears

Refresh page:
  deleted row remains gone

==================================================
11. REGRESSION
==================================================

Run:

- activation security tests
- admin RBAC tests
- admin activation-code tests
- full npm test
- lint
- build

Do not modify unrelated systems.

==================================================
12. FINAL REPORT
==================================================

Report exactly:

- migration created
- RPC created
- SUPER_ADMIN enforcement
- statuses allowed to delete
- statuses protected
- audit log behavior
- RLS/security results
- UI result
- tests passed
- lint result
- build result

STOP after this scope.
