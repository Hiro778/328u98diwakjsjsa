Audit dan perbaiki seluruh responsive layout aplikasi secara menyeluruh.

Masalah utama:
- Di mobile/HP layout terlihat berantakan.
- Ada elemen yang terlalu lebar, overflow horizontal, atau keluar viewport.
- Spacing, card, tabel, navbar, modal, button, form, dan typography belum beradaptasi dengan baik.
- Jangan merusak desktop layout yang sekarang sudah berjalan.

Target:
1. Mobile-first responsive design.
2. Pastikan tidak ada horizontal scrolling pada viewport 320px, 360px, 375px, 390px, 414px.
3. Semua halaman harus muat di viewport tanpa elemen keluar layar.
4. Gunakan breakpoint Tailwind dengan benar:
   - default = mobile
   - sm = 640px
   - md = 768px
   - lg = 1024px
   - xl = 1280px
5. Jangan menggunakan fixed width seperti width: 500px/600px untuk container yang harus responsive.
   Gunakan w-full, max-w-*, min-w-0, flex-wrap, grid-cols-1 lalu naik ke md/lg.
6. Untuk flex layout:
   - mobile: flex-col
   - desktop: md:flex-row
   - gunakan min-w-0 agar text tidak menyebabkan overflow.
7. Untuk grid:
   - mobile: grid-cols-1
   - tablet: md:grid-cols-2
   - desktop: lg:grid-cols-3/4 sesuai kebutuhan.
8. Semua image:
   - max-w-full
   - h-auto
   - object-contain/object-cover sesuai konteks.
9. Semua button/input:
   - jangan sampai keluar viewport.
   - pada mobile gunakan w-full jika diperlukan.
   - button group boleh flex-wrap.
10. Modal/dialog:
   - max-w-[calc(100vw-2rem)]
   - max-h-[90vh]
   - overflow-y-auto.
11. Navbar/header:
   - buat versi mobile yang compact.
   - jangan memaksa semua menu horizontal di layar kecil.
   - gunakan hamburger/dropdown jika diperlukan.
12. Tabel:
   - jangan membuat body halaman melebar.
   - jika tabel memang tidak bisa direflow, gunakan wrapper overflow-x-auto hanya pada tabel tersebut.
13. Typography:
   - heading besar harus responsive, misalnya text-2xl md:text-4xl.
   - jangan menggunakan font-size besar fixed yang menyebabkan overflow.
14. Container:
   - gunakan w-full max-w-* mx-auto px-4 sm:px-6 lg:px-8.
15. Periksa long text, email, URL, angka harga, dan nama bisnis agar tidak menyebabkan overflow.
   Gunakan break-words/truncate sesuai konteks.
16. Hindari solusi kasar seperti:
   - transform: scale()
   - zoom
   - fixed width besar
   - overflow-x-hidden sebagai satu-satunya solusi.
   Jangan hanya menyembunyikan overflow; perbaiki penyebabnya.

Audit semua route/page utama aplikasi, bukan hanya halaman yang sedang dibuka.

Prioritas:
1. Mobile 320–414px
2. Tablet 768px
3. Desktop 1024–1440px

Setelah perubahan:
- jalankan lint
- jalankan test
- jalankan production build
- pastikan tidak ada regression desktop.

Jika ada komponen yang dipakai bersama banyak halaman, perbaiki komponen tersebut di sumbernya daripada menambahkan workaround per halaman.

Berikan laporan:
- file yang diubah
- masalah responsive yang ditemukan
- solusi yang diterapkan
- hasil lint
- hasil test
- hasil build
