import { NavLink } from 'react-router'
import { SIDEBAR_NAV, CATEGORIES } from '../data/categories'

const NAV_GROUPS = [
  {
    header: 'UTAMA',
    itemIds: ['dashboard', 'ai-analyst'],
  },
  {
    header: 'MANAJEMEN BISNIS',
    itemIds: ['keuangan', 'operasional', 'penjualan'],
  },
  {
    header: 'PERTUMBUHAN',
    itemIds: ['marketing', 'legalitas', 'ekspor', 'insight'],
  },
  {
    header: 'DIREKTORI',
    itemIds: ['tools'],
  },
]

export default function SidebarNav({ onNavigate }) {
  const itemsById = Object.fromEntries(SIDEBAR_NAV.map((i) => [i.id, i]))

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
      {NAV_GROUPS.map((group) => {
        const groupItems = group.itemIds
          .map((id) => itemsById[id])
          .filter(Boolean)

        if (groupItems.length === 0) return null

        return (
          <div key={group.header}>
            <div className="px-3 pb-1.5 pt-1 text-[10px] font-bold tracking-wider text-text-muted uppercase">
              {group.header}
            </div>
            <div className="space-y-1">
              {groupItems.map((item) => {
                const cat = item.categoryId ? CATEGORIES[item.categoryId] : null
                const count = cat ? cat.tools.length : null

                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-primary-soft text-primary font-semibold shadow-xs'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <svg
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive
                              ? 'text-primary'
                              : 'text-text-muted group-hover:text-text-primary'
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={isActive ? 2.2 : 1.8}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d={item.icon}
                          />
                        </svg>
                        <span className="flex-1 truncate">{item.label}</span>
                        {count !== null && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                              isActive
                                ? 'bg-primary/15 text-primary'
                                : 'bg-surface-hover text-text-muted group-hover:text-text-secondary'
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )
}
