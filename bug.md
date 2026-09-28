









Lanjutkan FINAL GIT PREP saja.

Jangan mengubah code lagi.

1. Audit seluruh modified dan untracked files yang terkait Phase 2–7.
2. Pastikan tidak ada secret/API key/token di dalamnya.
3. Pastikan .env dan credential lokal tidak ikut Git.
4. Review .env.example agar hanya berisi nama environment variable tanpa secret.
5. Pastikan midtransPaymentSecurity.test.js dan verify_11_payment_authority_audit.mjs aman untuk di-commit.
6. Jangan commit debug script yang mengandung credential.
7. Jangan commit .env atau credential Vercel/Supabase.
8. Jalankan:
   git diff --check
   git status
9. Jika semuanya aman, commit dengan:
   chore: prepare Midtrans production configuration
10. Push origin main.
11. Verifikasi:
   git fetch origin
   git rev-list --left-right --count origin/main...main
   Target: 0 0
12. Jangan memasukkan Production credential.
13. Jangan melakukan transaksi Production.

STOP setelah push dan berikan report.
