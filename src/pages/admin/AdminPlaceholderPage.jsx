export default function AdminPlaceholderPage({ title, description, stage }) {
  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-8 text-center max-w-lg mx-auto mt-12 space-y-4">
      <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="text-sm text-gray-400">{description}</p>
      {stage && (
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#1F2937] text-gray-300 border border-[#374151]">
          {stage}
        </span>
      )}
    </div>
  )
}
