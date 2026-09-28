import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import BackButton from '../../../components/BackButton';
import {
  CREDIT_PACKAGES,
  getCreditOverview,
  createTopupOrder,
  verifyTopupPayment,
  getUsageHistory,
  getTopupHistory,
} from '../../../services/creativeCreditService';

export default function CreativeCreditsPage() {
  const { user, business } = useAuth();
  const [overview, setOverview] = useState({
    balance: { available: 0, reserved: 0, consumed: 0, total_earned: 0 },
    freeUsageAvailable: true,
    freeUsageRecord: null,
    monthConsumed: 0,
  });
  const [usageList, setUsageList] = useState([]);
  const [topupList, setTopupList] = useState([]);
  const [activeTab, setActiveTab] = useState('usage'); // 'usage' | 'topup'
  const [loading, setLoading] = useState(true);
  const [verifyingOrder, setVerifyingOrder] = useState(false);
  const [submittingPkg, setSubmittingPkg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (user && business) {
      loadAllData();
      checkRedirectOrder();
    }
  }, [user, business]);

  async function checkRedirectOrder() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id');

    // DO NOT trust query parameter transaction_status as truth of payment!
    // Always perform backend verification using order_id before marking paid.
    if (orderId && orderId.startsWith('CREDIT-')) {
      setVerifyingOrder(true);
      setErrorMsg(null);
      setSuccessMsg('Sedang memverifikasi status pembayaran kredit...');

      try {
        const result = await verifyTopupPayment(orderId);
        if (result.is_paid || result.status === 'paid') {
          setSuccessMsg(
            result.credits
              ? `Pembayaran berhasil diverifikasi! +${result.credits} Credits ditambahkan ke saldo Anda.`
              : 'Pembayaran berhasil diverifikasi! Saldo kredit telah diperbarui.'
          );
          await loadAllData();
        } else if (result.status === 'pending') {
          setSuccessMsg('Pembayaran masih diproses oleh gateway. Saldo akan otomatis bertambah setelah selesai.');
          await loadAllData();
        } else if (result.status === 'failed') {
          setErrorMsg('Pembayaran gagal atau dibatalkan.');
        } else {
          setSuccessMsg('Status pembayaran belum selesai.');
        }
      } catch (err) {
        console.error('Error verifying order:', err);
        setErrorMsg('Gagal memverifikasi pembayaran. Silakan periksa riwayat top up.');
      } finally {
        setVerifyingOrder(false);
        // Clean URL parameters without reloading page
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
  }

  async function loadAllData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [ov, usage, topup] = await Promise.all([
        getCreditOverview(),
        getUsageHistory(),
        getTopupHistory(),
      ]);
      setOverview(ov);
      setUsageList(usage);
      setTopupList(topup);
    } catch (err) {
      console.error('Error loading credit data:', err);
      setErrorMsg('Gagal memuat informasi kredit. Silakan refresh halaman.');
    } finally {
      setLoading(false);
    }
  }

  async function handleTopup(packageKey) {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmittingPkg(packageKey);

    try {
      const order = await createTopupOrder(packageKey);

      if (window.snap && order.snap_token) {
        window.snap.pay(order.snap_token, {
          onSuccess: async function () {
            setSuccessMsg('Pembayaran selesai! Memverifikasi ke server...');
            if (order.order_id) {
              try {
                await verifyTopupPayment(order.order_id);
              } catch (e) {
                console.warn('Verify error:', e);
              }
            }
            await loadAllData();
          },
          onPending: function () {
            setSuccessMsg('Menunggu penyelesaian pembayaran.');
            loadAllData();
          },
          onError: function () {
            setErrorMsg('Pembayaran gagal atau dibatalkan.');
          },
          onClose: function () {
            loadAllData();
          },
        });
      } else if (order.redirect_url) {
        window.location.href = order.redirect_url;
      } else {
        setErrorMsg('Gagal menginisialisasi pembayaran.');
      }
    } catch (err) {
      console.error('Topup error:', err);
      setErrorMsg(err.message || 'Terjadi kesalahan saat memproses top up.');
    } finally {
      setSubmittingPkg(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-8">
      <BackButton fallbackUrl="/dashboard/marketing" label="Kembali" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Creative Credits
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Kelola saldo kredit untuk pembuatan konten marketing AI BisnisSehat.
          </p>
        </div>
        <a
          href="#paket-credits"
          className="inline-flex items-center justify-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
        >
          + Top Up Credits
        </a>
      </div>

      {verifyingOrder && (
        <div className="p-4 text-sm text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-900 flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Memverifikasi status pembayaran kredit ke server...</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 text-sm text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-900">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-4 text-sm text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-300 rounded-lg border border-green-200 dark:border-green-900">
          {successMsg}
        </div>
      )}

      {/* Saldo & Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Saldo Aktif */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Saldo Tersedia
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
              {loading ? '...' : overview.balance.available}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">Credits</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Dapat digunakan kapan saja</p>
        </div>

        {/* Free AI Status */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Status Free AI
          </span>
          <div className="mt-2">
            {overview.freeUsageAvailable ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                🎁 1x AI Gratis Tersedia
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                ✓ Free AI Sudah Digunakan
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">1x seumur hidup per bisnis</p>
        </div>

        {/* Usage Periode Ini */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Usage Bulan Ini
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gray-900 dark:text-white">
              {loading ? '...' : overview.monthConsumed}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">Credits</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Total operasi AI marketing</p>
        </div>

        {/* Total Digunakan */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Total Digunakan (Lifetime)
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gray-900 dark:text-white">
              {loading ? '...' : overview.balance.consumed}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">Credits</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Sepanjang masa</p>
        </div>
      </div>

      {/* Section Paket Top Up */}
      <div id="paket-credits" className="space-y-4 pt-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Pilihan Paket Top Up
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Pilih paket credits sesuai kebutuhan promosi UMKM Anda. Pembayaran resmi & otomatis terverifikasi.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.values(CREDIT_PACKAGES).map((pkg) => {
            const isPopular = pkg.badge === 'Paling populer';
            const isSubmitting = submittingPkg === pkg.key;

            return (
              <div
                key={pkg.key}
                className={`relative bg-white dark:bg-gray-900 rounded-xl p-5 border flex flex-col justify-between transition-all ${
                  isPopular
                    ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                    {pkg.badge}
                  </span>
                )}

                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {pkg.name}
                  </h3>
                  <div>
                    <div className="text-2xl font-black text-gray-900 dark:text-white">
                      Rp{pkg.priceIdr.toLocaleString('id-ID')}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Rp{pkg.pricePerCredit.toLocaleString('id-ID')} / credit
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      +{pkg.credits.toLocaleString('id-ID')}
                    </span>{' '}
                    Creative Credits
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleTopup(pkg.key)}
                    className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${
                      isPopular
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-white'
                    }`}
                  >
                    {isSubmitting ? 'Memproses...' : 'Beli Paket'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section Riwayat */}
      <div className="space-y-4 pt-6 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('usage')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === 'usage'
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Riwayat Penggunaan
            </button>
            <button
              onClick={() => setActiveTab('topup')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === 'topup'
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Riwayat Top Up
            </button>
          </div>
          <button
            onClick={loadAllData}
            className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Tab 1: Riwayat Penggunaan */}
        {activeTab === 'usage' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {usageList.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Belum ada riwayat penggunaan kredit.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase font-medium">
                    <tr>
                      <th className="px-5 py-3">Tanggal</th>
                      <th className="px-5 py-3">Operasi</th>
                      <th className="px-5 py-3">Jumlah</th>
                      <th className="px-5 py-3">Sisa Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                    {usageList.map((row) => (
                      <tr key={row.id}>
                        <td className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                          {new Date(row.created_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-5 py-3 font-medium">
                          {row.description || 'Penggunaan AI'}
                        </td>
                        <td className="px-5 py-3 text-red-600 dark:text-red-400 font-semibold">
                          {row.credits} Credits
                        </td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                          {row.balance_after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Riwayat Top Up */}
        {activeTab === 'topup' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {topupList.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Belum ada riwayat transaksi top up.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase font-medium">
                    <tr>
                      <th className="px-5 py-3">Order ID</th>
                      <th className="px-5 py-3">Tanggal</th>
                      <th className="px-5 py-3">Paket</th>
                      <th className="px-5 py-3">Kredit</th>
                      <th className="px-5 py-3">Nominal</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                    {topupList.map((row) => {
                      const isPaid = row.status === 'paid' || row.status === 'settlement';
                      const isPending = row.status === 'pending';

                      return (
                        <tr key={row.id}>
                          <td className="px-5 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">
                            {row.order_id}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                            {new Date(row.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-5 py-3 font-medium capitalize">
                            {row.package_key}
                          </td>
                          <td className="px-5 py-3 text-emerald-600 dark:text-emerald-400 font-semibold">
                            +{row.credits}
                          </td>
                          <td className="px-5 py-3">
                            Rp{Number(row.amount_idr).toLocaleString('id-ID')}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                isPaid
                                  ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                                  : isPending
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                              }`}
                            >
                              {isPaid ? 'Berhasil' : isPending ? 'Menunggu' : 'Gagal'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
