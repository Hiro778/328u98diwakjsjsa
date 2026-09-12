import { useAuth } from '../context/AuthContext'
import { getPlanDisplay } from '../data/categories'

export default function DashboardPage() {
  const { profile, business, subscription } = useAuth()

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-navy-700">
        Selamat datang, {profile?.full_name?.split(' ')[0] || 'Kamu'}
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        {business?.name || 'Bisnis lo'} &middot; {getPlanDisplay(subscription?.plan).label}
      </p>

      {/* Quick stats placeholder */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Revenue', value: '—', color: 'text-warm-400' },
          { label: 'Profit', value: '—', color: 'text-profit-500' },
          { label: 'Stok', value: '—', color: 'text-electric-500' },
          { label: 'Pelanggan', value: '—', color: 'text-navy-500' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-surface p-5">
            <p className="text-xs font-medium text-text-muted uppercase">{stat.label}</p>
            <p className={`mt-1 text-2xl font-extrabold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Coming soon notice */}
      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        <p className="text-sm font-semibold text-navy-700">Tools segera hadir</p>
        <p className="mt-1 text-sm text-text-secondary">
          Dashboard ini akan menampilkan data bisnis lo secara real-time. Saat ini sedang dalam pengembangan.
        </p>
      </div>
    </div>
  )
}
