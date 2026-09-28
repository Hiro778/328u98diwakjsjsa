FIX PROFILE SUPABASE RLS ERROR — DO NOT REBUILD PROFILE.

Saya sudah membuka:

/dashboard/profile

UI Profile sudah tampil dengan benar dan avatar file picker + preview juga sudah bekerja.

MASALAH SAAT INI:

Saat menekan "Simpan foto", muncul toast/error:

"new row violates row-level security policy"

Jadi sekarang fokus utama adalah DEBUG dan memperbaiki RLS/database operation.

JANGAN membuat ulang ProfilePage.
JANGAN membuat table profiles baru.
JANGAN membuat bucket avatars baru.
JANGAN menghapus RLS sebagai workaround.
JANGAN menggunakan service-role key di frontend.

==================================================
1. TRACE ERROR SEBENARNYA
==================================================

Inspect code:

profileService.js
ProfilePage.jsx
AuthContext.jsx
Supabase client
migration 058_avatar_storage_and_profile.sql
RLS policies public.profiles
RLS policies public.businesses
RLS policies storage.objects

Cari operasi yang menghasilkan:

"new row violates row-level security policy"

Tentukan apakah error berasal dari:

A. storage.objects INSERT
B. public.profiles INSERT/UPDATE
C. public.businesses INSERT/UPDATE

Jangan menebak.

Tambahkan/log error Supabase secara aman jika diperlukan sehingga kita tahu operasi mana yang gagal.

==================================================
2. CEK AUTHENTICATED USER
==================================================

Pastikan operasi menggunakan:

const { data: { user } } = await supabase.auth.getUser();

atau mekanisme auth yang memang sudah digunakan project.

Pastikan:

user.id === profile.id

untuk profile.

Dan jika menggunakan businesses:

businesses.owner_id === user.id

Jangan menggunakan ID dari input frontend sebagai sumber otoritas.

==================================================
3. PROFILE RLS
==================================================

Inspect policy public.profiles.

Target:

Authenticated user hanya boleh:

SELECT profile sendiri
UPDATE profile sendiri

Jika profile memang dibuat oleh trigger setelah signup, JANGAN membuat duplicate profile.

Jika profile belum ada dan code memang melakukan INSERT:
→ pastikan ada policy INSERT yang benar-benar diperlukan.

Policy harus membatasi:

auth.uid() = id

Jangan menggunakan policy:

WITH CHECK (true)

Jangan membuka INSERT untuk semua authenticated users.

==================================================
4. BUSINESS RLS
==================================================

Inspect public.businesses.

Profile page memiliki operasi:

updateUserBusiness(
  businessId,
  userId,
  { name, businessType, businessCategory, location }
)

Tetapi jika businessId kosong/null dan service melakukan:

INSERT INTO businesses

maka RLS INSERT policy harus mengizinkan user membuat business miliknya sendiri.

Target policy:

owner_id = auth.uid()

Jangan membuat business milik user lain.

Jika business sebenarnya sudah ada:
→ jangan INSERT.
→ ambil business berdasarkan owner_id dan UPDATE record tersebut.

Jika business belum ada:
→ INSERT dengan owner_id = authenticated user ID.

Pastikan policy INSERT memiliki:

WITH CHECK (owner_id = auth.uid())

Dan UPDATE memiliki:

USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid())

==================================================
5. STORAGE AVATARS RLS
==================================================

Bucket:

avatars

Path:

{userId}/avatar-{timestamp}.{extension}

Pastikan INSERT policy storage.objects mengizinkan authenticated user upload hanya ke folder:

auth.uid()

Contoh logic:

(storage.foldername(name))[1] = auth.uid()::text

Pastikan bucket ID:

avatars

dan authenticated user memiliki permission INSERT.

Jangan membuat bucket public sebagai workaround security.

SELECT public boleh jika memang desain avatar menggunakan public URL.

UPDATE/DELETE juga harus dibatasi ke folder user sendiri.

==================================================
6. PENTING: BEDAKAN STORAGE DAN DATABASE
==================================================

Avatar flow harus:

STEP 1:
Upload image ke storage.

STEP 2:
getPublicUrl / path.

STEP 3:
UPDATE profiles.avatar_url.

Jangan melakukan INSERT profile jika profile user sudah ada.

Jika update profiles.avatar_url gagal:
→ jangan menyatakan upload profile berhasil.

Jika storage upload gagal:
→ jangan update avatar_url ke URL yang tidak valid.

==================================================
7. PERIKSA EXISTING DATA
==================================================

Untuk authenticated user yang sedang login:

SELECT profile berdasarkan:

id = auth.uid()

dan business berdasarkan:

owner_id = auth.uid()

Jangan membuat data dummy.

Jika profile sudah ada:
→ UPDATE.

Jika business sudah ada:
→ UPDATE.

Jika business belum ada:
→ INSERT dengan owner_id = auth.uid().

==================================================
8. MIGRATION
==================================================

Jika RLS policy yang benar belum ada, buat migration baru.

JANGAN mengedit migration lama jika migration tersebut sudah pernah dijalankan di environment.

Gunakan migration baru, misalnya:

059_fix_profile_rls.sql

Tetapi sebelum membuat migration:
→ inspect existing policies
→ jangan membuat duplicate policy dengan nama sama.

Migration harus aman dan idempotent jika memungkinkan.

==================================================
9. SECURITY REQUIREMENT
==================================================

JANGAN melakukan:

ALTER TABLE ... DISABLE ROW LEVEL SECURITY

JANGAN:

WITH CHECK (true)

JANGAN:

USING (true)

JANGAN:

service_role key di frontend.

JANGAN bypass RLS.

Perbaiki policy berdasarkan ownership yang benar.

==================================================
10. ACCEPTANCE TEST

Setelah fix:

TEST A:
Login sebagai user.

TEST B:
Buka:

/dashboard/profile

TEST C:
Pilih avatar.

TEST D:
Klik "Simpan foto".

Expected:

- tidak ada RLS error
- upload berhasil
- profiles.avatar_url berhasil diperbarui
- avatar langsung berubah di Profile
- avatar berubah di Header
- avatar berubah di AccountDropdown

TEST E:
Refresh browser.

Expected:
avatar tetap ada.

TEST F:
Logout → login kembali.

Expected:
avatar tetap ada.

TEST G:
Edit Nama.

Expected:
profiles.full_name berubah.

TEST H:
Edit informasi bisnis.

Expected:
businesses record milik user berubah.

TEST I:
Pastikan user A tidak dapat mengubah profile/business/avatar user B.

==================================================
11. OUTPUT
==================================================

Setelah memperbaiki:

Tampilkan:

1. ROOT CAUSE ERROR
2. Operasi mana yang terkena RLS
3. Policy yang sebelumnya salah/tidak ada
4. Policy yang diperbaiki
5. Migration yang dibuat
6. Files changed
7. Test result
8. npm run build result

JANGAN hanya mengatakan "RLS fixed".

Saya ingin root cause yang spesifik.

CONTOH:

"Error berasal dari INSERT public.businesses karena business belum ada tetapi policy INSERT belum mengizinkan owner_id = auth.uid()."

atau:

"Error berasal dari storage.objects INSERT karena policy folder ownership tidak cocok dengan path upload."

Cari penyebab sebenarnya dari error di codebase dan Supabase.
