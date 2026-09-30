AUDIT + FIX: Custom Domain BisnisSehat masih redirect ke vercel.app setelah login/tools

Context:
Production custom domain:
https://bisnissehat.my.id

Saat membuka:
https://bisnissehat.my.id
domain sudah benar.

MASALAH:
Saat user masuk ke Tools dan melakukan login/navigation, aplikasi masih mengarahkan atau menampilkan URL:
https://328u98diwakjsjsa-69hp.vercel.app/...

GOAL:
Seluruh user-facing production flow harus tetap berada di:
https://bisnissehat.my.id

JANGAN menghapus domain *.vercel.app dari konfigurasi Vercel. Vercel tetap hosting provider. Yang diperbaiki adalah URL/redirect aplikasi.

PHASE 1 — AUDIT SAJA DULU
Cari seluruh referensi production URL dan redirect:

- 328u98diwakjsjsa-69hp.vercel.app
- vercel.app
- VITE_APP_URL
- VITE_SITE_URL
- SITE_URL
- APP_URL
- window.location.origin
- window.location.href
- window.location.assign
- window.location.replace
- redirectTo
- emailRedirectTo
- OAuth callback
- Supabase auth redirect
- login callback
- logout redirect
- router navigation
- pricing/tool links
- external/internal absolute URLs
- canonical URL
- Open Graph URL
- manifest/start_url jika ada

Periksa:
- src/
- public/
- index.html
- .env*
- Supabase auth configuration/code
- Edge Functions yang berkaitan dengan auth
- Vercel configuration
- package scripts/config

PHASE 2 — IDENTIFY ROOT CAUSE
Untuk setiap URL Vercel yang ditemukan, kategorikan:

1. Hardcoded source code
2. Environment variable
3. Supabase OAuth redirect configuration
4. Vercel configuration
5. Generated URL
6. Intentional Vercel deployment URL

Jangan mengubah intentional Vercel infrastructure references.

PHASE 3 — FIX
Production canonical app URL harus:

https://bisnissehat.my.id

Gunakan environment variable hanya jika arsitektur aplikasi memang membutuhkan absolute URL.

Untuk browser internal navigation, PREFER relative routes:
- /dashboard
- /pricing
- /tools/...
- /login

Jangan membuat:
https://328u98diwakjsjsa-69hp.vercel.app/dashboard

Untuk OAuth:
- gunakan production canonical URL
- pastikan callback kembali ke https://bisnissehat.my.id/...
- jangan menghilangkan localhost development redirect jika memang diperlukan

Untuk Supabase:
audit auth redirect configuration dan pastikan production redirect:
https://bisnissehat.my.id/**

Jangan mengubah RLS, database schema, payment authority, QRIS POS, Midtrans/activation-code logic, atau fitur bisnis lain.

PHASE 4 — IMPORTANT
Jangan sekadar replace semua string "vercel.app".

Pertahankan:
- Vercel deployment/infrastructure config
- preview deployment behavior
- localhost development
- Supabase URLs
- third-party URLs

Pastikan production domain ditentukan secara aman.

PHASE 5 — TEST
Wajib test:

1. Buka https://bisnissehat.my.id
2. Login
3. Setelah login URL tetap *.bisnissehat.my.id
4. Buka dashboard
5. Buka Tools
6. Buka salah satu tool
7. Logout
8. Login kembali
9. Test Google OAuth jika digunakan
10. Refresh halaman authenticated
11. Direct open:
   https://bisnissehat.my.id/dashboard
12. Direct open salah satu tool
13. Pastikan tidak ada redirect ke *.vercel.app

Static scan:
grep -Rni --exclude-dir=node_modules --exclude-dir=.git \
"328u98diwakjsjsa-69hp.vercel.app" .

Lalu audit semua:
grep -Rni --exclude-dir=node_modules --exclude-dir=.git \
"vercel.app" src public index.html .

Bedakan intentional infrastructure references dari user-facing URL.

PHASE 6 — BUILD
npm test
npm run build

Jika ada lint command yang digunakan project, jalankan juga.

OUTPUT:
- ROOT CAUSE
- FILES CHANGED
- EXACT REDIRECT FLOW BEFORE
- EXACT REDIRECT FLOW AFTER
- Supabase redirect configuration status
- Vercel env status (jangan tampilkan secret)
- test results
- build result

SCOPE LOCK:
Hanya perbaikan production canonical domain dan auth/navigation redirects.
Jangan menyentuh fitur lain.
