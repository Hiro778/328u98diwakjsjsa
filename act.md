FIX ONLY — SHOW PRO ACTIVATION CODE REVOKE ACTION IN ADMIN UI

CURRENT ISSUE:
Di production /admin/activation-codes, tabel sudah menampilkan:
- kode masked
- paket
- status
- dibuat tanggal
- digunakan oleh
- tanggal redeem

Tetapi TIDAK ADA kolom/action untuk Revoke.

Backend sebelumnya sudah memiliki:
public.admin_revoke_pro_activation_code(p_code_id uuid, p_reason text)

TASK:
Hubungkan RPC revoke tersebut ke UI AdminActivationCodesPage.jsx.

IMPORTANT:
- Jangan membuat RPC revoke baru jika sudah ada.
- Jangan membuat tabel baru.
- Jangan hard-delete activation code.
- Jangan mengubah redeem logic.
- Jangan mengubah QRGenerator.jsx.
- Jangan mengubah POS/QRIS/payment.
- Jangan mengubah Admin RBAC.

1. Inspect existing:
- AdminActivationCodesPage.jsx
- activationCodeService.js
- admin_revoke_pro_activation_code()
- pro_activation_codes schema

2. Tambahkan kolom:
ACTION

Untuk status:
unused / aktif / belum dipakai:
tampilkan tombol:
[Revoke]

Untuk status:
redeemed / sudah terpakai:
JANGAN tampilkan tombol revoke.
Tampilkan:
"Sudah digunakan"

Untuk status:
revoked:
tampilkan:
"Revoked"

3. Saat klik Revoke:
Buka confirmation modal.

Tampilkan:
- masked activation code
- target email
- duration
- warning bahwa kode tidak bisa digunakan lagi
- input wajib:
  Alasan pencabutan

Button:
Batal
Revoke Kode

4. Panggil:
admin_revoke_pro_activation_code(
  p_code_id,
  p_reason
)

5. Setelah sukses:
- refresh list
- status berubah menjadi Revoked
- revoke reason terlihat di detail/list bila desain existing mendukung
- jangan menghapus record database

6. Security:
- hanya admin yang bisa melihat action
- jangan menerima user_id/redeemed_by dari frontend
- p_code_id saja sebagai identifier
- server-side RPC tetap melakukan is_admin()
- redeemed code harus ditolak oleh server walaupun frontend dimanipulasi
- IDOR test: admin tidak boleh mengubah record yang tidak seharusnya dapat diubah
- anonymous/non-admin RPC tetap ditolak

7. UX:
Kolom Action jangan membuat tabel desktop rusak.
Untuk mobile:
- action boleh menjadi button/menu yang tetap accessible
- jangan menyebabkan horizontal overflow baru.

8. Test:
- unused code → Revoke button muncul
- redeemed code → Revoke button tidak muncul
- revoked code → tidak bisa revoke lagi
- revoke berhasil → status berubah
- reason wajib
- normal user denied
- anonymous denied
- direct RPC manipulation denied
- existing activation security tests tetap PASS

9. Run:
npm test
npm run lint
npm run build

10. Jika ada perubahan source:
git status
git add -A
git commit -m "fix: add activation code revoke action"
git push origin main

FINAL REPORT:
- root cause kenapa action tidak terlihat
- files changed
- apakah RPC existing digunakan
- revoke behavior
- security tests
- npm test
- lint
- build
- git commit/push
- STOP.
