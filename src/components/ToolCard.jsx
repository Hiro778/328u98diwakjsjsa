import { useNavigate } from 'react-router'

export default function ToolCard({ tool }) {
  const navigate = useNavigate()
  const isComingSoon = tool.status === 'coming_soon'
  const needsConnection = tool.status === 'needs_connection'

  function handleClick() {
    if (isComingSoon) return
    if (tool.path) {
      navigate(tool.path)
    }
  }

  const statusLabel = isComingSoon
    ? 'Tool ini segera tersedia'
    : needsConnection
      ? 'Perlu koneksi'
      : tool.path
        ? 'Siap digunakan'
        : null

  const statusColor = isComingSoon
    ? 'text-text-muted'
    : needsConnection
      ? 'text-warm-500'
      : 'text-profit-600'

  return (
    <button
      onClick={handleClick}
      disabled={isComingSoon}
      className={`w-full rounded-xl border p-5 text-left transition-all ${
        isComingSoon
          ? 'cursor-default border-border bg-surface opacity-60'
          : 'cursor-pointer border-border bg-surface hover:border-profit-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-navy-600">{tool.name}</span>
      </div>
      {statusLabel && (
        <p className={`mt-2 text-[11px] ${statusColor}`}>{statusLabel}</p>
      )}
    </button>
  )
}
