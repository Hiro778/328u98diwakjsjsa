/**
 * adsRecommendations.js
 * Source-first official documentation and platform capabilities for Ads.
 * 
 * Strict compliance (ads.md):
 * - Priority 1: Official Meta learning / Blueprint resources
 * - Priority 2: Official TikTok for Business resources
 * - Priority 3: Official Google Ads resources
 * - Verified working external URLs (HTTP 200)
 * - Structured around practical UMKM situations:
 *   Platform -> Situation -> Action -> Metrics -> Common Mistake -> Official Resource
 * - No fake benchmarks, CPM, CPC, or ranking
 * - No fabricated trends or audience sizes
 */

export const ADS_RECOMMENDATIONS = [
  // ----------------------------------------------------
  // META ADS (Priority 1)
  // ----------------------------------------------------
  {
    id: 'meta-reels-ads',
    platform: 'Meta Ads',
    category: 'Video Kreatif',
    title: 'META — Mulai dari Reels Ads Vertikal',
    situation: 'UMKM yang sudah punya konten video pendek dan ingin mengujinya sebagai iklan berbayar di Instagram Reels & Facebook Reels.',
    actions: [
      'Gunakan format video vertikal penuh 9:16 (resolusi 1080 x 1920 piksel) dengan hook pesan menarik di 3 detik pertama.',
      'Pastikan teks penting dan tombol CTA tidak tertutup antarmuka Reels (beri jarak aman 35% di bagian bawah dan 6% di sisi kanan).',
      'Gunakan audio atau musik bebas royalti dari Sound Collection agar video tidak otomatis dibisukan oleh sistem.',
      'Mulai uji dengan anggaran harian kecil terukur (misal Rp 25.000 – Rp 50.000/hari) selama minimal 3–5 hari untuk melihat respon audiens.'
    ],
    metrics: ['CTR', 'CPC', 'CVR', 'CPA', 'ROAS'],
    commonMistake: 'Mengunggah ulang video horizontal (16:9) yang dipotong paksa, atau meletakkan judul produk di bagian bawah yang tertutup antarmuka aplikasi.',
    sourceName: 'Meta Blueprint — Reels Placement Explanation & Specs',
    sourceUrl: 'https://www.facebookblueprint.com/student/activity/691040-reels-placement-explanation-video',
    // Backward compatibility fields
    summary: 'Format iklan video vertikal rasio 9:16 di Instagram dan Facebook Reels untuk menarik minat calon pembeli baru.',
    howToTry: [
      'Gunakan format video vertikal penuh 9:16 (resolusi 1080 x 1920 piksel) dengan hook di 3 detik pertama.',
      'Pastikan teks pesan tidak tertutup antarmuka Reels di tepi bawah dan kanan.',
      'Gunakan penempatan Advantage+ Placements atau pilih Reels secara spesifik di Ads Manager.',
      'Mulai uji anggaran kecil dan bandingkan rasio klik dengan biaya per konversi.'
    ],
    bestFor: 'UMKM yang sudah punya konten video produk pendek dan ingin menguji respon pasar di Instagram & Facebook.',
    risks: 'Mengunggah video horizontal (16:9) yang di-crop atau materi dengan watermark aplikasi lain dapat menurunkan jangkauan.',
    updatedAt: 'Terverifikasi 2026',
  },
  {
    id: 'meta-retargeting-custom-audience',
    platform: 'Meta Ads',
    category: 'Retargeting Pelanggan',
    title: 'META — Retargeting Pelanggan & Custom Audience',
    situation: 'UMKM yang sudah memiliki kontak pelanggan (WhatsApp/database nomor pembeli) atau pengunjung toko yang belum melakukan checkout.',
    actions: [
      'Ekspor daftar nomor telepon atau email pelanggan yang pernah bertransaksi ke dalam file spreadsheet (CSV).',
      'Buka Meta Ads Manager > Audiences > Create Audience > Custom Audience > Customer List.',
      'Buat kampanye penawaran khusus "Repeat Order" atau voucher promo bagi pelanggan lama tersebut.',
      'Kombinasikan dengan exclusion agar pembeli yang baru saja order hari ini tidak melihat promo yang sama.'
    ],
    metrics: ['CVR', 'Repeat CPA', 'ROAS', 'Frequency'],
    commonMistake: 'Menghabiskan seluruh anggaran iklan hanya untuk menjaring audiens baru (cold audience), padahal biaya akuisisi repeat order pelanggan lama jauh lebih hemat.',
    sourceName: 'Meta Blueprint — Guide to Audience Targeting & Custom Audiences',
    sourceUrl: 'https://www.facebookblueprint.com/student/catalog/list?category_ids=7506-your-guide-to-audience-targeting',
    // Backward compatibility fields
    summary: 'Menargetkan ulang pelanggan lama dan prospek yang sudah mengenal brand untuk meningkatkan repeat purchase dengan CPA lebih rendah.',
    howToTry: [
      'Siapkan kontak pelanggan yang pernah membeli dalam format CSV.',
      'Buat Custom Audience di Ads Manager dari daftar kontak atau pengunjung website.',
      'Buat materi iklan penawaran khusus repeat order atau produk pelengkap.',
      'Pantau Frequency agar iklan tidak membosankan audiens pelanggan lama.'
    ],
    bestFor: 'Bisnis yang sudah memiliki basis pembeli dan ingin memacu transaksi ulang secara efisien.',
    risks: 'Frekuensi penayangan yang terlalu tinggi pada audiens kecil dapat memicu ad fatigue (kejenuhan audiens).',
    updatedAt: 'Terverifikasi 2026',
  },
  {
    id: 'meta-campaign-structure',
    platform: 'Meta Ads',
    category: 'Budget Kecil / Struktur',
    title: 'META — Struktur Kampanye & Pengujian Budget Kecil',
    situation: 'UMKM pemula dengan budget iklan terbatas yang ingin memulai beriklan tanpa terjebak fitur "Boost Post" yang kurang terarah.',
    actions: [
      'Gunakan dashboard resmi Meta Ads Manager di komputer untuk kendali objektif dan penempatan anggaran yang presisi.',
      'Pilih objektif yang sesuai tujuan: "Penjualan" (Sales) jika memiliki checkout website, atau "Leads/Interaksi" jika bertransaksi via WhatsApp.',
      'Alokasikan budget harian kecil ke dalam 1 Ad Set dengan 2–3 variasi gambar/video materi iklan untuk menguji ad mana yang paling efisien.',
      'Biarkan sistem berjalan stabil selama 3–5 hari tanpa mengubah pengaturan agar sistem lelang menyelesaikan fase pengenalan.'
    ],
    metrics: ['CPA Threshold', 'CPC', 'CTR', 'Conversions'],
    commonMistake: 'Terlalu sering mengganti target audiens atau mematikan iklan dalam 24 jam pertama saat data konversi belum mencukupi untuk dianalisis.',
    sourceName: 'Meta Blueprint — Get Started with Meta Ads Manager',
    sourceUrl: 'https://www.facebookblueprint.com/student/activity/415305-get-started-with-ads-manager',
    // Backward compatibility fields
    summary: 'Panduan menyusun kampanye iklan terstruktur di Meta Ads Manager dengan alokasi budget efisien untuk pemilik usaha kecil.',
    howToTry: [
      'Akses Meta Ads Manager dan buat kampanye baru dengan objektif terukur.',
      'Tentukan batas anggaran harian sesuai toleransi Break-even CPA dari Ads Calculator.',
      'Uji 2–3 materi visual berbeda dalam satu grup iklan.',
      'Evaluasi biaya per hasil setelah mendapatkan impresi dan interaksi yang cukup.'
    ],
    bestFor: 'UMKM yang baru memulai beriklan di Meta dan ingin menghindari pemborosan biaya uji coba.',
    risks: 'Mengubah parameter kampanye terlalu sering akan mereset fase pembelajaran sistem lelang.',
    updatedAt: 'Terverifikasi 2026',
  },
  {
    id: 'meta-advantage-automation',
    platform: 'Meta Ads',
    category: 'Katalog Produk',
    title: 'META — Advantage+ Catalog & Automasi Kampanye',
    situation: 'UMKM ritel, fashion, atau F&B yang memiliki banyak varian produk dan ingin menampilkan produk secara otomatis sesuai ketertarikan pengguna.',
    actions: [
      'Unggah katalog produk ke Commerce Manager dengan foto beresolusi jelas, harga, dan ketersediaan stok.',
      'Pilih format Advantage+ Catalog Ads saat membuat kampanye berobjektif Sales.',
      'Atur Existing Customer Budget Cap untuk memastikan porsi anggaran dialokasikan seimbang antara prospek baru dan pelanggan lama.',
      'Bandingkan realisasi ROAS kampanye dengan target matematis dari Ads Calculator BisnisSehat.'
    ],
    metrics: ['Break-even ROAS', 'Target ROAS', 'Actual CPA', 'AOV'],
    commonMistake: 'Menjalankan automasi Advantage+ tanpa menetapkan batas anggaran harian dan tanpa memeriksa ketersediaan stok produk di etalase.',
    sourceName: 'Meta Blueprint — Advantage Catalog Ads & Automated Tools',
    sourceUrl: 'https://www.facebookblueprint.com/student/activity/579390-how-to-personalize-your-campaigns-with-advantage-catalog-ads',
    // Backward compatibility fields
    summary: 'Automasi penyajian katalog produk Meta untuk mempromosikan item yang paling relevan bagi setiap calon pembeli.',
    howToTry: [
      'Sinkronkan katalog produk ke Meta Commerce Manager.',
      'Aktifkan kampanye Advantage+ Catalog Ads dengan objektif penjualan.',
      'Tetapkan batas anggaran pengeluaran harian.',
      'Monitor metrik ROAS dan CPA terhadap kontribusi margin produk.'
    ],
    bestFor: 'Toko online atau bisnis ritel dengan katalog multi-produk.',
    risks: 'Produk yang kehabisan stok jika tidak diperbarui di katalog akan tetap diiklankan oleh sistem.',
    updatedAt: 'Terverifikasi 2026',
  },

  // ----------------------------------------------------
  // TIKTOK ADS (Priority 2)
  // ----------------------------------------------------
  {
    id: 'tiktok-spark-ads',
    platform: 'TikTok Ads',
    category: 'Video Kreatif',
    title: 'TIKTOK — Spark Ads dari Konten Organik Terbukti',
    situation: 'UMKM yang sudah memiliki video TikTok organik atau video ulasan kreator yang terbukti mendapatkan penonton (FYP) dan interaksi tinggi.',
    actions: [
      'Ambil Kode Otorisasi Video (Spark Ads Video Code) dari postingan video akun TikTok bisnismu atau kreator afiliasi.',
      'Buka TikTok Ads Manager > Campaign > Create > Pilih format penayangan "Spark Ads" menggunakan kode tersebut.',
      'Pertahankan gaya asli video (native & authentic); jangan diedit ulang menjadi video promosi bergaya iklan komersial kaku.',
      'Sematkan tombol Call-to-Action langsung menuju tautan etalase toko atau WhatsApp pemesanan.'
    ],
    metrics: ['Engaged CTR', '2-Second View Rate', 'CPC', 'CVR', 'CPA'],
    commonMistake: 'Mengiklankan materi video baru yang belum pernah diuji secara organik, atau menggunakan video yang terlalu kaku sehingga langsung diskip pengguna.',
    sourceName: 'TikTok for Business Help Center — Spark Ads Guide',
    sourceUrl: 'https://ads.tiktok.com/resources/help/article/spark-ads',
    // Backward compatibility fields
    summary: 'Mendorong video TikTok organik yang sudah terbukti populer menjadi iklan berbayar dengan mempertahankan interaksi dan komentar asli.',
    howToTry: [
      'Pilih video TikTok dengan rasio tonton dan komentar organik terbaik.',
      'Generate Spark Ads code melalui aplikasi TikTok.',
      'Input kode ke TikTok Ads Manager sebagai materi kreatif kampanye.',
      'Pantau rasio konversi klik dan biaya per hasil.'
    ],
    bestFor: 'UMKM yang aktif membuat konten di TikTok atau bekerja sama dengan mikro-kreator.',
    risks: 'Memilih video yang tidak memiliki proposisi nilai produk yang jelas hanya akan menghasilkan likes tanpa penjualan.',
    updatedAt: 'Terverifikasi 2026',
  },
  {
    id: 'tiktok-smart-performance',
    platform: 'TikTok Ads',
    category: 'Budget Kecil / Struktur',
    title: 'TIKTOK — Smart Performance Campaign (SPC) untuk Budget Terbatas',
    situation: 'UMKM dengan budget terbatas dan tanpa staf khusus media buying yang ingin mengoptimalkan anggaran secara cerdas untuk penjualan.',
    actions: [
      'Pilih tujuan promosi "Conversions" atau "Sales" di TikTok Ads Manager.',
      'Aktifkan opsi "Smart Performance Campaign" (SPC) untuk menyerahkan optimasi bidding dan penargetan ke machine learning TikTok.',
      'Unggah minimal 3–5 variasi video vertikal pendek (durasi 15–30 detik) agar algoritma dapat merotasi konten secara sehat.',
      'Bandingkan Actual CPA yang didapat dengan Break-even CPA dari Ads Calculator sebelum memutuskan menambah budget.'
    ],
    metrics: ['Actual CPA', 'Break-even CPA', 'ROAS', 'CVR'],
    commonMistake: 'Hanya mengunggah 1 video tunggal sehingga performa iklan drop drastis dalam beberapa hari akibat kelelahan audiens (ad fatigue).',
    sourceName: 'TikTok for Business Help Center — About Smart Performance Campaign',
    sourceUrl: 'https://ads.tiktok.com/resources/help/article/smart-performance-campaign',
    // Backward compatibility fields
    summary: 'Kampanye otomasi end-to-end TikTok yang memaksimalkan konversi penjualan dari anggaran harian pengiklan UMKM.',
    howToTry: [
      'Buka TikTok Ads Manager > Buat Kampanye > Aktifkan Smart Performance Campaign.',
      'Unggah minimal 3 variasi video promosi vertikal.',
      'Tentukan sasaran anggaran harian sesuai kalkulator bisnis.',
      'Evaluasi metrik biaya akuisisi setelah masa pembelajaran awal.'
    ],
    bestFor: 'Pengiklan yang ingin menghemat waktu pengelolaan teknis targeting manual.',
    risks: 'Memerlukan variasi materi video baru secara rutin agar algoritma terus bekerja optimal.',
    updatedAt: 'Terverifikasi 2026',
  },
  {
    id: 'tiktok-shop-ads',
    platform: 'TikTok Ads',
    category: 'Katalog Produk',
    title: 'TIKTOK — Product Shopping Ads (PSA) Toko Lokal',
    situation: 'UMKM penjual produk fisik yang aktif berjualan di etalase TikTok Shop dan ingin meningkatkan pesanan langsung dari aplikasi.',
    actions: [
      'Tautkan akun toko TikTok Shop ke akun TikTok for Business Center.',
      'Pilih objektif kampanye "Product Sales" dengan sumber produk langsung dari TikTok Shop.',
      'Gunakan Product Shopping Ads untuk menempatkan kartu produk di tab pencarian "Shop" dan di feed belanja pengguna.',
      'Pastikan rating ulasan toko berada di level aman (minimal bintang 4.3) dan persediaan stok memadai sebelum mengaktifkan iklan.'
    ],
    metrics: ['Actual ROAS', 'Order CPA', 'GMV', 'ACOS'],
    commonMistake: 'Mengiklankan produk dengan ulasan bintang rendah atau stok menipis, sehingga biaya iklan terbuang saat pembeli membatalkan pesanan.',
    sourceName: 'TikTok for Business Help Center — Product Shopping Ads Overview',
    sourceUrl: 'https://ads.tiktok.com/resources/help/article/product-shopping-ads',
    // Backward compatibility fields
    summary: 'Iklan khusus ekosistem TikTok Shop untuk menampilkan produk langsung di tab belanja dan video dengan kemudahan transaksi instan.',
    howToTry: [
      'Hubungkan toko TikTok Shop dengan Ads Manager.',
      'Pilih produk unggulan yang memiliki bukti kepuasan pembeli.',
      'Atur penayangan Product Shopping Ads di tab Shop dan Search.',
      'Ukur nilai ACOS (Persentase biaya iklan terhadap revenue yang diatribusikan ke iklan) untuk menjaga profitabilitas.'
    ],
    bestFor: 'Pedagang dan produsen lokal yang menggunakan TikTok Shop sebagai kanal penjualan utama.',
    risks: 'Biaya admin/komisi marketplace tetap perlu diperhitungkan dalam fee variabel Ads Calculator.',
    updatedAt: 'Terverifikasi 2026',
  },
  {
    id: 'tiktok-creative-trends',
    platform: 'TikTok Ads',
    category: 'Video Kreatif',
    title: 'TIKTOK — Riset Format Video & Tren Kreatif Indonesia',
    situation: 'UMKM yang kehabisan ide materi video dan ingin mengetahui formula video yang sedang berkinerja tinggi di industri sejenis.',
    actions: [
      'Kunjungi portal resmi TikTok Creative Center (dapat diakses publik secara gratis tanpa biaya).',
      'Pilih filter wilayah "Indonesia" dan sesuaikan kategori industri sesuai bidang bisnismu (F&B, Fashion, Skincare, dll).',
      'Analisis struktur 3 detik pertama (hook), ritme musik, dan sudut pengambilan gambar dari iklan berkinerja teratas (Top Ads).',
      'Terapkan pola cerita tersebut (misal: "Masalah nyata -> Solusi produk -> Bukti testimoni -> Call to action") ke produkmu sendiri.'
    ],
    metrics: ['2-Second View Rate', 'CTR', 'Engagement Rate'],
    commonMistake: 'Meniru tren luar negeri tanpa adaptasi bahasa dan gaya bertutur yang akrab bagi konsumen lokal di Indonesia.',
    sourceName: 'TikTok Creative Center — Top Ads & Trends Inspiration',
    sourceUrl: 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en',
    // Backward compatibility fields
    summary: 'Pusat riset data tren resmi TikTok untuk memantau lagu populer, gaya video, dan iklan berkinerja tertinggi di Indonesia.',
    howToTry: [
      'Buka TikTok Creative Center di browser.',
      'Pilih filter kawasan Indonesia dan industri bisnis terkait.',
      'Catat formula hook 3 detik yang paling banyak menahan penonton.',
      'Produksi materi iklan baru berdasar pola yang telah terbukti.'
    ],
    bestFor: 'Pelaku usaha yang memproduksi konten promosi mandiri dan butuh inspirasi teruji.',
    risks: 'Tren video bergerak cepat; materi video perlu diperbarui secara berkala.',
    updatedAt: 'Terverifikasi 2026',
  },

  // ----------------------------------------------------
  // GOOGLE ADS (Priority 3)
  // ----------------------------------------------------
  {
    id: 'google-target-roas',
    platform: 'Google Ads',
    category: 'Budget Kecil / Struktur',
    title: 'GOOGLE — Smart Bidding Target ROAS untuk Margin Sehat',
    situation: 'UMKM yang menjual beragam produk di toko online/website dan ingin memprioritaskan penjualan produk dengan nilai margin lebih tinggi.',
    actions: [
      'Pastikan Conversion Tracking dengan parameter nilai transaksi (transaction value) sudah terpasang rapi di sistem checkout.',
      'Gunakan Ads Calculator BisnisSehat untuk menghitung Break-even ROAS dan Target ROAS berdasarkan HPP dan fee variabel bisnismu.',
      'Pilih strategi bidding "Maximize conversion value" dan centang "Set a target return on ad spend (ROAS)".',
      'Beri waktu algoritma lelang selama minimal 2–3 minggu sebelum mengubah target untuk menjaga kestabilan data.'
    ],
    metrics: ['Actual ROAS', 'Break-even ROAS', 'Conversion Value', 'Cost'],
    commonMistake: 'Memasang angka Target ROAS yang tidak realistis (misal langsung pasang 10x di awal) sehingga iklan tidak memenangkan lelang dan impresi berhenti total.',
    sourceName: 'Google Ads Help — About Target ROAS Bidding',
    sourceUrl: 'https://support.google.com/google-ads/answer/6268637?hl=id',
    // Backward compatibility fields
    summary: 'Strategi bidding otomatis dari Google yang mengoptimalkan nilai konversi berdasarkan target ROAS yang ditentukan pengiklan.',
    howToTry: [
      'Pastikan pelacakan nilai konversi aktif di Google Ads.',
      'Buka kampanye di Google Ads > Settings > Bidding.',
      'Pilih "Maximize conversion value" dan tentukan Target ROAS sesuai kalkulator.',
      'Evaluasi kestabilan perolehan nilai penjualan setelah masa pembelajaran.'
    ],
    bestFor: 'Toko online dengan variasi harga produk yang ingin memacu penjualan bernilai tinggi.',
    risks: 'Menyetel target ROAS terlalu tinggi dapat membatasi volume impresi secara drastis.',
    updatedAt: 'Terverifikasi 2026',
  },
  {
    id: 'google-exact-match',
    platform: 'Google Ads',
    category: 'Budget Kecil / Struktur',
    title: 'GOOGLE — Exact Match & Kata Kunci Negatif untuk Hemat Budget',
    situation: 'UMKM dengan budget pencarian terbatas yang ingin memastikan setiap rupiah klik berasal dari pencari yang berniat beli (high intent).',
    actions: [
      'Gunakan tanda kurung siku [kata kunci] untuk exact match pada nama produk spesifik bisnismu.',
      'Audit menu "Search Terms Report" secara berkala minimal seminggu sekali untuk memantau istilah pencarian asli yang mengetik iklanmu.',
      'Tambahkan istilah yang tidak relevan (seperti "gratis", "lowongan", "cara buat", "pdf", "tutorial") ke daftar Negative Keywords.',
      'Hitung Max CPC aman menggunakan rumus: CPA Threshold × Estimasi CVR dari Ads Calculator BisnisSehat.'
    ],
    metrics: ['Max CPC', 'Actual CPC', 'Search Impression Share', 'CVR'],
    commonMistake: 'Menggunakan Broad Match tanpa daftar kata kunci negatif yang ketat sehingga anggaran lekas habis terserap oleh pencari informasi gratisan.',
    sourceName: 'Google Ads Help — About Keyword Matching Options',
    sourceUrl: 'https://support.google.com/google-ads/answer/7478529?hl=id',
    // Backward compatibility fields
    summary: 'Pengendalian intent pencarian calon pembeli menggunakan kata kunci persis dan kata kunci negatif untuk mencegah pemborosan budget.',
    howToTry: [
      'Gunakan tanda kurung siku [kata kunci] untuk produk spesifik.',
      'Tinjau tab Search Terms Report secara rutin.',
      'Tambahkan kata kunci negatif untuk istilah yang tidak menghasilkan penjualan.',
      'Bandingkan Max CPC aman dengan biaya klik riil.'
    ],
    bestFor: 'UMKM dengan anggaran pencarian terbatas yang ingin memprioritaskan klik berniat beli tinggi.',
    risks: 'Volume pencarian lebih sedikit dibandingkan penargetan kata kunci luas.',
    updatedAt: 'Terverifikasi 2026',
  },
];
