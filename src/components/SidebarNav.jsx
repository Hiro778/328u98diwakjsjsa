import { NavLink } from 'react-router'
import { SIDEBAR_NAV, CATEGORIES } from '../data/categories'

export default function SidebarNav({ onNavigate }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {SIDEBAR_NAV.map((item) => {
        const cat = item.categoryId ? CATEGORIES[item.categoryId] : null
        const count = cat ? cat.tools.length : null
        return (
          <NavLink
            key={item.id}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              `mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-warm-400/10 text-warm-500'
                  : 'text-text-secondary hover:bg-navy-50 hover:text-navy-700'
              }`
            }
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <span className="flex-1">{item.label}</span>
            {count !== null && (
              <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-text-muted">
                {count}
              </span>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}
