Lanjutkan hanya finalisasi fix yang sudah diverifikasi.

1. git diff --check
2. git status
3. Pastikan hanya perubahan case-sensitive import di src/App.jsx:
   './pages/dashboard/pos/POSPage'
   →
   './pages/dashboard/pos/PosPage'

4. Commit:
   fix: resolve PosPage case-sensitive import

5. Push ke origin main.

6. Verifikasi:
   git fetch origin
   git rev-list --left-right --count origin/main...main
   git status

Expected:
0 0
working tree clean

JANGAN mengubah file lain.
JANGAN memasukkan secret.
JANGAN mengubah environment variables.
