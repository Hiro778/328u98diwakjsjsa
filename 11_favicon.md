Ganti favicon / browser tab icon BisnisSehat menggunakan logo yang saya upload.

Scope:
- Hanya ubah favicon/browser tab icon.
- Jangan ubah layout, navbar, sidebar, logo di dalam aplikasi, atau branding lain.
- Gunakan gambar logo yang saya upload sebagai sumber favicon.
- Letakkan asset favicon di public/ dengan nama yang jelas, misalnya:
  public/favicon.png
- Update index.html agar favicon menggunakan asset tersebut.
- Jika project memiliki manifest/PWA icon, sinkronkan icon utama dengan logo yang sama.
- Pastikan favicon tetap terlihat jelas pada ukuran kecil 16x16 dan 32x32.
- Hapus/referensi favicon "BS" lama jika memang berasal dari asset yang diganti.
- Jangan mengubah title "Bisnis Sehat".
- Setelah selesai jalankan npm run build untuk memastikan tidak ada error.

Verifikasi:
1. Build PASS.
2. Tidak ada favicon "BS" lama yang masih direferensikan.
3. Browser tab menggunakan logo baru.
