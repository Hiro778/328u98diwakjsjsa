import { useAdminAuth } from '../../hooks/useAdminAuth.js'

export default function AdminTestingPage({ isSuperOnly = false }) {
  const { role, isSuperAdmin } = useAdminAuth()

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#111827] border border-[#1F2937] rounded-xl p-6 text-center space-y-4">
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Admin Access Verified
        </div>
        <h1 className="text-xl font-bold text-white">
          {isSuperOnly ? 'Super Admin Area' : 'Admin Control Center'}
        </h1>
        <p className="text-sm text-gray-400">
          Route guard berhasil diverifikasi server-side.
        </p>
        <div className="bg-[#1F2937]/50 p-3 rounded-lg text-left text-xs space-y-1">
          <div><span className="text-gray-400">Server Role:</span> <span className="font-mono text-emerald-400">{role}</span></div>
          <div><span className="text-gray-400">Is Super Admin:</span> <span className="font-mono text-emerald-400">{isSuperAdmin ? 'true' : 'false'}</span></div>
        </div>
      </div>
    </div>
  )
}
