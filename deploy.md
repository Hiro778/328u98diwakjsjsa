DEPLOY ALL LATEST LOCAL CHANGES TO GITHUB

Tujuan:
Deploy seluruh perubahan terbaru yang saat ini ada di local project ke GitHub agar Vercel yang terhubung ke repository otomatis melakukan redeploy.

PROJECT:
- Current project: /mnt/d/website/umkm
- Git repository: repository yang sedang digunakan project ini
- Vercel sudah terhubung ke GitHub

IMPORTANT:
- Jangan mengubah source code.
- Jangan melakukan refactor.
- Jangan memperbaiki fitur apa pun.
- Jangan menghapus perubahan yang sudah ada.
- Jangan reset/revert local changes.
- Jangan membuat migration baru.
- Fokus ONLY pada verification → commit → push.

STEP 1 — Inspect Git

Run:

git status
git branch --show-current
git remote -v

Identifikasi:
- branch aktif
- remote origin
- perubahan tracked/untracked

STEP 2 — Review changes

Run:

git diff --stat
git diff --cached --stat

Pastikan perubahan memang merupakan pekerjaan terbaru yang ingin dideploy.

Jangan gunakan git reset --hard.
Jangan gunakan git checkout untuk membuang perubahan.
Jangan gunakan git clean -fd.

STEP 3 — Basic verification

Run:

npm run build

Jika build gagal:
- STOP.
- Jangan commit/push.
- Tampilkan error lengkap dan file penyebabnya.

Jika build PASS lanjut.

STEP 4 — Commit all latest changes

Stage seluruh perubahan:

git add -A

Review:

git status
git diff --cached --stat

Pastikan tidak ada:
- .env
- service-role keys
- private keys
- credentials
- secrets
- node_modules
- build artifacts yang seharusnya tidak masuk repository

Jika ada secret/credential:
STOP dan jangan commit.

STEP 5 — Commit

Gunakan commit message:

feat: deploy latest production changes

STEP 6 — Push

Push branch aktif ke origin:

git push origin <CURRENT_BRANCH>

Jangan force push.

STEP 7 — Verify

Run:

git status
git log -1 --oneline
git remote -v

Pastikan working tree bersih atau hanya menyisakan file yang memang sengaja tidak tracked.

FINAL REPORT harus berisi:
1. Branch yang dipush
2. Commit hash
3. Commit message
4. Jumlah/file perubahan
5. Build result
6. Push result
7. GitHub repository/branch tujuan
8. Apakah Vercel seharusnya otomatis ter-trigger oleh push

STOP setelah push berhasil.
