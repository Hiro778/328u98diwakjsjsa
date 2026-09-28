Bereskan GitHub Push Protection di project ini.

Konteks:
- Commit lokal saat ini: 566fdff
- GitHub menolak push karena mendeteksi secret:
  1. Supabase Secret Key di debug_image_audit.mjs:15
  2. Groq API Key di bot/config.js:283
- debug_image_audit.mjs sudah di-git rm --cached karena hanya script debug lokal.
- bot Telegram tetap digunakan dan HARUS tetap berfungsi.
- bot/config.js JANGAN dihapus.
- Bot akan dijalankan di Vercel.

Tugas:
1. Audit perubahan Git saat ini sebelum melakukan commit/push.
2. Pastikan debug_image_audit.mjs tidak masuk commit.
3. Ubah seluruh API key hardcoded yang memang digunakan bot menjadi environment variables dengan process.env.
   Contoh:
   groq: process.env.GROQ_API_KEY || ""
   Pertahankan struktur APIkey dan seluruh pemanggilan config.APIkey.* agar kompatibel.
4. Jangan mengubah behavior bot selain sumber credential.
5. Pastikan .env, .env.local, credential lokal, dan secret lain tidak masuk Git.
6. Buat/update .env.example hanya dengan nama variable, tanpa nilai secret.
7. Audit repository untuk pola secret seperti:
   gsk_, sb_secret_, service_role, Google API key, dan credential API lainnya.
8. Jangan menampilkan nilai secret di output/report.
9. Jangan menghapus bot Telegram atau fitur bot.
10. Jangan menggunakan GitHub "unblock secret".
11. Setelah aman, buat commit baru yang menggantikan commit lokal sebelumnya.
12. Push ke origin main.
13. Setelah push, lakukan:
    git fetch origin
    git rev-list --left-right --count origin/main...main
14. Target akhir harus:
    0 0
15. Verifikasi bahwa origin/main menunjuk ke commit terbaru.

PENTING:
- Jangan melakukan perubahan di luar kebutuhan secret cleanup dan Git push.
- Jangan reset atau menghapus source code bot.
- Jangan commit API key asli.
- Jika menemukan secret lain yang belum bisa dipindahkan dengan aman, STOP sebelum push dan laporkan nama file + nomor baris tanpa menampilkan nilai secret.
- Jangan menganggap "Everything up-to-date" sebagai bukti berhasil. Verifikasi dengan rev-list.
