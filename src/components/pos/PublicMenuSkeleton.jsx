import { memo } from 'react'

/**
 * PublicMenuSkeleton
 * Instant lightweight skeleton shell rendered during initial cold load of QR Menu.
 * Prevents screen flash, layout shifts, and long blank spinner waits.
 */
function PublicMenuSkeleton() {
  return (
    <div className="min-h-screen bg-[#FFF9F4] text-[#1E2A5E] antialiased pb-20">
      {/* Topbar Skeleton */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/5 bg-white/95 px-4 py-2.5 shadow-2xs backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-black/10 animate-pulse" />
          <div className="h-4 w-28 rounded-md bg-black/10 animate-pulse" />
        </div>
        <div className="h-6 w-16 rounded-full bg-black/5 animate-pulse" />
      </header>

      {/* Hero Banner Skeleton */}
      <div className="px-4 pt-3.5 pb-1">
        <div className="h-40 sm:h-52 w-full rounded-3xl bg-black/8 animate-pulse border border-black/5" />
      </div>

      {/* Category Filter Pills Skeleton */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
        <div className="h-8 w-16 shrink-0 rounded-full bg-black/15 animate-pulse" />
        <div className="h-8 w-24 shrink-0 rounded-full bg-black/8 animate-pulse" />
        <div className="h-8 w-20 shrink-0 rounded-full bg-black/8 animate-pulse" />
        <div className="h-8 w-28 shrink-0 rounded-full bg-black/8 animate-pulse" />
      </div>

      {/* Product Cards Grid Skeleton */}
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="flex flex-col justify-between overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xs"
          >
            {/* Image Placeholder */}
            <div className="aspect-square w-full bg-black/8 animate-pulse" />

            {/* Product Meta */}
            <div className="p-3 space-y-2">
              <div className="h-3.5 w-4/5 rounded bg-black/10 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-black/5 animate-pulse" />
              <div className="flex items-center justify-between pt-2">
                <div className="h-4 w-16 rounded bg-black/10 animate-pulse" />
                <div className="h-7 w-7 rounded-full bg-black/10 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(PublicMenuSkeleton)
