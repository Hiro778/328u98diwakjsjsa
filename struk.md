TASK: Migrasikan HANYA backend/provider AI untuk fitur Generate Video ke Atlas Cloud, lalu setelah integrasi terbukti WORK, ubah UI Generate Video menjadi Coming Soon.

SCOPE SANGAT KETAT:
- HANYA fitur AI Video Generator yang boleh diubah.
- PRD / Product Requirements Document / fitur PRD JANGAN DIUBAH.
- PRD HARUS tetap menggunakan Gemini seperti implementasi sekarang.
- Veo 3 untuk PRD HARUS tetap menggunakan Gemini.
- Jangan mengganti Gemini menjadi Atlas di PRD.
- Jangan mengubah shared Gemini service/configuration jika perubahan tersebut berpotensi memengaruhi PRD.
- Jangan melakukan refactor besar di luar kebutuhan Video Generator.

FASE 1 — AUDIT
1. Audit implementasi AI Video Generator saat ini.
2. Identifikasi:
   - frontend entry point
   - backend/API route
   - video generation service
   - provider/model yang sekarang digunakan
   - database/history jika ada
   - storage/output handling
   - loading/status/error handling
3. Audit juga jalur PRD dan pastikan secara eksplisit service/model Gemini yang digunakan PRD tidak ikut tersentuh.

FASE 2 — MIGRASI VIDEO GENERATOR KE ATLAS
Migrasikan provider KHUSUS Video Generator ke Atlas Cloud.

Gunakan environment variable backend:
ATLAS_API_KEY

JANGAN expose ATLAS_API_KEY ke frontend.

Endpoint Atlas:
POST https://api.atlascloud.ai/api/v1/model/generateVideo

Authentication:
Authorization: Bearer ${ATLAS_API_KEY}

Untuk MVP gunakan:
model:
bytedance/seedance-2.0-mini/text-to-video

Default:
- resolution: 480p
- ratio: 9:16
- duration: 8 detik atau sesuai limit yang sudah ditentukan aplikasi
- generate_audio: true

Contoh request:

{
  "model": "bytedance/seedance-2.0-mini/text-to-video",
  "prompt": "...",
  "duration": 8,
  "resolution": "480p",
  "ratio": "9:16",
  "generate_audio": true
}

PENTING:
- Jangan menganggap response generate langsung berarti video sudah selesai.
- Ikuti mekanisme status/output Atlas yang benar berdasarkan dokumentasi/API yang digunakan.
- Handle status processing/completed/failed dengan benar.
- Jangan membuat endpoint/status flow fiktif.
- Jangan membuat retry infinite.
- Jangan duplicate generation karena retry frontend.
- Simpan task ID/provider response yang diperlukan untuk tracking.
- Jika aplikasi sekarang memiliki history generation, pertahankan flow tersebut.

IMAGE-TO-VIDEO:
Jika Video Generator saat ini mendukung image-to-video, migrasikan juga provider-nya ke Atlas dengan model Atlas yang sesuai.
Jangan menghapus kemampuan yang sudah ada tanpa alasan teknis.

FASE 3 — SECURITY & COST CONTROL
Tambahkan server-side protection:
- API key hanya di backend.
- Batasi duration.
- Batasi resolution.
- Validasi prompt.
- Prevent duplicate request.
- Jangan melakukan retry tanpa batas.
- Jangan membuat frontend bisa menentukan model/provider secara bebas.
- Model Atlas ditentukan server-side.
- Jangan memberikan akses langsung browser ke Atlas API key.

FASE 4 — PASTIKAN VIDEO GENERATOR BENAR-BENAR WORK
Sebelum mengubah UI menjadi Coming Soon:
1. Test request ke backend.
2. Pastikan backend berhasil mengirim request ke Atlas.
3. Pastikan task ID/status bisa ditangani.
4. Pastikan output video bisa diterima aplikasi.
5. Pastikan error handling bekerja.
6. Pastikan history/database/storage flow tidak rusak.
7. Jalankan test.
8. Jalankan production build.

JANGAN lanjut ke fase Coming Soon kalau integrasi Video Generator belum benar-benar work.

FASE 5 — SETELAH WORK, BARU JADIKAN COMING SOON
Setelah seluruh integrasi Atlas berhasil dan test/build berhasil:

Ubah UI fitur "Generate Video" menjadi:
COMING SOON

Ketentuan:
- User tidak bisa menjalankan generation dari UI publik.
- Tombol/action generation harus disabled atau diganti Coming Soon.
- Jangan menghapus backend Atlas integration.
- Jangan menghapus service Atlas.
- Jangan menghapus database/history logic.
- Jangan menghapus konfigurasi ATLAS_API_KEY.
- Implementasi Atlas tetap disimpan agar fitur bisa diaktifkan kembali nanti.

Jika ada halaman/card/menu khusus Video Generator:
- tampilkan status Coming Soon secara jelas
- jangan membuat request generation ketika user mengkliknya
- jangan menampilkan error palsu
- UX tetap rapi dan konsisten dengan design system aplikasi.

FASE 6 — VALIDASI PRD (WAJIB)
Setelah semuanya selesai, audit kembali PRD.

Pastikan:
- PRD tetap memakai Gemini.
- Veo 3 tetap memakai Gemini.
- Tidak ada ATLAS_API_KEY yang dipakai oleh PRD.
- Tidak ada model Atlas yang masuk ke flow PRD.
- Tidak ada perubahan behavior PRD akibat migrasi Video Generator.

Jika menemukan shared service yang dipakai Video Generator DAN PRD:
JANGAN mengganti behavior shared service secara global.
Pisahkan provider Video Generator agar perubahan Atlas hanya berlaku untuk Video Generator.

OUTPUT AKHIR
Laporkan secara ringkas:
1. File yang diubah.
2. Provider Video Generator sebelum → Atlas Cloud.
3. Model Atlas yang digunakan.
4. Status: Video Generator integration WORK / NOT WORK.
5. Setelah work: UI Video Generator = Coming Soon.
6. PRD provider = Gemini.
7. Veo 3 PRD = Gemini.
8. Test result.
9. Build result.
10. Jelaskan jika ada bagian yang sengaja tidak diubah karena berada di scope PRD.

CRITICAL:
Jangan mengubah PRD.
Jangan mengganti Veo 3 PRD.
Jangan memindahkan PRD ke Atlas.
Jangan berhenti hanya setelah API request berhasil; pastikan full flow Video Generator bekerja terlebih dahulu.
