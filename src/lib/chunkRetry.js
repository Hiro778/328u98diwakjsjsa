import { lazy as reactLazy } from 'react'

/**
 * Key identifiers used for reload circuit breaker in sessionStorage.
 */
export const CHUNK_RELOAD_KEY = 'bs_chunk_retry_timestamp'
export const CHUNK_RELOAD_COUNT_KEY = 'bs_chunk_retry_count'
export const MAX_AUTO_RELOADS = 1
export const RELOAD_COOLDOWN_MS = 15000 // 15 seconds

/**
 * Determines whether a thrown error corresponds to a dynamic import chunk loading failure.
 * Handles diverse error signatures across Chrome, Firefox, Safari, Vite, and Rollup/Rolldown:
 * - Chrome: "Failed to fetch dynamically imported module: ..."
 * - Firefox: "error loading dynamically imported module"
 * - Safari: "importing a module script failed" / "Load failed"
 * - HTML fallback from SPA rewrite: "Unexpected token '<'" / "MIME type text/html"
 * - CSS chunk loading failure
 *
 * @param {Error|unknown} error
 * @returns {boolean}
 */
export function isChunkLoadError(error) {
  if (!error) return false

  const actualError = error?.reason || error?.payload || error
  const name = String(actualError?.name || '').toLowerCase()
  const msg = String(actualError?.message || actualError || '').toLowerCase()
  const stack = String(actualError?.stack || '').toLowerCase()

  return (
    name === 'chunkloaderror' ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('dynamically imported module') ||
    msg.includes('failed to load module script') ||
    msg.includes('css chunk load failed') ||
    msg.includes('loading css chunk') ||
    msg.includes('unable to preload css') ||
    (msg.includes('mime type') && msg.includes('text/html')) ||
    msg.includes("unexpected token '<'") ||
    msg.includes("expected expression, got '<'") ||
    msg.includes('is not valid javascript') ||
    msg.includes('load failed') ||
    msg.includes('failed to load resource') ||
    msg.includes('networkerror when attempting to fetch resource') ||
    msg.includes('net::err_') ||
    stack.includes('failed to fetch dynamically imported module')
  )
}

/**
 * Checks whether it is safe to automatically reload the page without entering an infinite loop.
 *
 * @param {Storage} [storage=window.sessionStorage]
 * @returns {boolean}
 */
export function canAutoReload(storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
  if (!storage) return false

  try {
    const lastTimestamp = Number(storage.getItem(CHUNK_RELOAD_KEY) || 0)
    const count = Number(storage.getItem(CHUNK_RELOAD_COUNT_KEY) || 0)
    const now = Date.now()

    // If cooldown has elapsed, previous retry cycle has expired
    if (now - lastTimestamp > RELOAD_COOLDOWN_MS) {
      return true
    }

    return count < MAX_AUTO_RELOADS
  } catch {
    return true
  }
}

/**
 * Records an auto-reload attempt into session storage to prevent infinite reload loops.
 *
 * @param {Storage} [storage=window.sessionStorage]
 */
export function recordAutoReload(storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
  if (!storage) return

  try {
    const lastTimestamp = Number(storage.getItem(CHUNK_RELOAD_KEY) || 0)
    const count = Number(storage.getItem(CHUNK_RELOAD_COUNT_KEY) || 0)
    const now = Date.now()

    if (now - lastTimestamp > RELOAD_COOLDOWN_MS) {
      storage.setItem(CHUNK_RELOAD_COUNT_KEY, '1')
    } else {
      storage.setItem(CHUNK_RELOAD_COUNT_KEY, String(count + 1))
    }
    storage.setItem(CHUNK_RELOAD_KEY, String(now))
  } catch {}
}

/**
 * Resets the reload counters (e.g. after manual user action or successful load).
 *
 * @param {Storage} [storage=window.sessionStorage]
 */
export function resetAutoReload(storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
  if (!storage) return

  try {
    storage.removeItem(CHUNK_RELOAD_KEY)
    storage.removeItem(CHUNK_RELOAD_COUNT_KEY)
  } catch {}
}

/**
 * Wraps dynamic import with in-memory retry and deployment-aware reload recovery.
 *
 * 1. Attempts the import.
 * 2. On transient error, retries up to `retries` times with exponential delay.
 * 3. If retries are exhausted and error is a chunk 404 (due to a new deployment):
 *    - Checks auto-reload loop guard.
 *    - Triggers a page reload so the browser fetches the new HTML and chunk manifest.
 *    - Returns an unresolved promise during reload to prevent error flashes.
 * 4. If auto-reload limit is reached or not a chunk error, throws to ErrorBoundary.
 *
 * @param {() => Promise<any>} importer
 * @param {number} [retries=2]
 * @param {number} [delayMs=300]
 * @param {object} [env={ window, sessionStorage }]
 * @returns {Promise<any>}
 */
export async function retryDynamicImport(
  importer,
  retries = 2,
  delayMs = 300,
  env = typeof window !== 'undefined' ? { window, storage: window.sessionStorage } : {}
) {
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const module = await importer()
      // If import succeeds, clear any stale reload count
      if (env.storage) {
        resetAutoReload(env.storage)
      }
      return module
    } catch (err) {
      lastError = err

      // Non-chunk errors fail immediately without retry/reload
      if (!isChunkLoadError(err)) {
        throw err
      }

      // If more retry attempts remain, wait briefly before retrying in-memory
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
      }
    }
  }

  // All in-memory retries failed with a chunk load error.
  // This typically indicates a production deployment replaced the chunk hash.
  if (canAutoReload(env.storage) && env.window?.location?.reload) {
    recordAutoReload(env.storage)
    env.window.location.reload()
    // Return an unresolved promise so React Suspense/ErrorBoundary doesn't flash an error while reloading
    return new Promise(() => {})
  }

  throw lastError
}

/**
 * Drop-in resilient replacement for React.lazy that incorporates chunk failure recovery.
 *
 * @param {() => Promise<any>} importer
 * @param {number} [retries=2]
 * @param {number} [delayMs=300]
 * @returns {React.LazyExoticComponent<any>}
 */
export function lazyWithRetry(importer, retries = 2, delayMs = 300) {
  return reactLazy(() => retryDynamicImport(importer, retries, delayMs))
}

/**
 * Alias for lazyWithRetry to allow simple drop-in import:
 * import { lazy } from './lib/chunkRetry'
 */
export const lazy = lazyWithRetry

/**
 * Registers global chunk failure listeners:
 * 1. Vite's native 'vite:preloadError' event
 * 2. Window 'unhandledrejection' event for unhandled dynamic import rejections
 * 3. Window 'error' event capture phase for script/link chunk load errors
 *
 * @param {Window} [win=window]
 * @param {Storage} [storage=window.sessionStorage]
 */
export function registerVitePreloadErrorHandler(
  win = typeof window !== 'undefined' ? window : null,
  storage = typeof window !== 'undefined' ? window.sessionStorage : null
) {
  if (!win || typeof win.addEventListener !== 'function') return
  if (win.__bs_vite_preload_handler_registered) return

  win.__bs_vite_preload_handler_registered = true

  // 1. Vite's native preload error event
  win.addEventListener('vite:preloadError', (event) => {
    if (canAutoReload(storage) && win.location?.reload) {
      if (typeof event?.preventDefault === 'function') {
        event.preventDefault()
      }
      recordAutoReload(storage)
      win.location.reload()
    } else {
      console.error(
        '[BisnisSehat] Vite dynamic import preload failed repeatedly. Auto-reload suspended to avoid loop.',
        event?.payload
      )
    }
  })

  // 2. Unhandled promise rejections originating from chunk loading
  win.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event?.reason)) {
      if (canAutoReload(storage) && win.location?.reload) {
        if (typeof event?.preventDefault === 'function') {
          event.preventDefault()
        }
        recordAutoReload(storage)
        win.location.reload()
      }
    }
  })

  // 3. Error event capture phase for script/link chunk load failures
  win.addEventListener(
    'error',
    (event) => {
      const target = event?.target
      if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
        const src = target.src || target.href || ''
        if (
          (src.includes('/assets/') || src.endsWith('.js') || src.endsWith('.css')) &&
          canAutoReload(storage) &&
          win.location?.reload
        ) {
          recordAutoReload(storage)
          win.location.reload()
        }
      }
    },
    true
  )
}
