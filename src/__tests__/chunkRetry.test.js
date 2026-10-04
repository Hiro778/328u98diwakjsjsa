import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  isChunkLoadError,
  canAutoReload,
  recordAutoReload,
  resetAutoReload,
  retryDynamicImport,
  registerVitePreloadErrorHandler,
  CHUNK_RELOAD_COUNT_KEY,
} from '../lib/chunkRetry.js'

describe('Global Dynamic Import & Chunk Recovery Suite', () => {
  it('1. correctly identifies all browser chunk load errors', () => {
    // Chrome / Chromium
    assert.equal(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://bisnissehat.my.id/assets/MarginAnalysis-CInUbDpa.js')),
      true
    )
    // Firefox
    assert.equal(isChunkLoadError(new TypeError('error loading dynamically imported module')), true)
    // Safari / WebKit
    assert.equal(isChunkLoadError(new TypeError('Importing a module script failed.')), true)
    assert.equal(isChunkLoadError(new TypeError('Load failed')), true)
    // SPA HTML fallback (MIME type mismatch or unexpected token '<')
    assert.equal(
      isChunkLoadError(new TypeError("Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\".")),
      true
    )
    assert.equal(isChunkLoadError(new SyntaxError("Unexpected token '<'")), true)
    assert.equal(isChunkLoadError(new SyntaxError("expected expression, got '<'")), true)
    // Network / generic chunk load errors
    assert.equal(isChunkLoadError(new Error('Loading chunk 42 failed')), true)
    assert.equal(isChunkLoadError(new Error('CSS chunk load failed')), true)
    assert.equal(isChunkLoadError(new Error('Unable to preload CSS for /assets/theme.css')), true)

    // Non-chunk errors should NOT be treated as chunk load errors
    assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")), false)
    assert.equal(isChunkLoadError(new ReferenceError('variable is not defined')), false)
    assert.equal(isChunkLoadError(null), false)
  })

  it('2. unwraps event.reason and event.payload in isChunkLoadError', () => {
    // Rejection event
    const rejectionEvent = {
      reason: new TypeError('Failed to fetch dynamically imported module: chunk-123.js')
    }
    assert.equal(isChunkLoadError(rejectionEvent), true)

    // Vite preload error event
    const vitePreloadEvent = {
      payload: new Error('Unable to preload CSS for /assets/main.css')
    }
    assert.equal(isChunkLoadError(vitePreloadEvent), true)
  })

  it('3. enforces single reload guard in sessionStorage and prevents infinite loop', () => {
    const memoryStorage = new Map()
    const mockStorage = {
      getItem: (key) => memoryStorage.get(key) || null,
      setItem: (key, val) => memoryStorage.set(key, String(val)),
      removeItem: (key) => memoryStorage.delete(key),
    }

    // Initial state: can auto-reload
    assert.equal(canAutoReload(mockStorage), true)

    // First auto-reload recorded
    recordAutoReload(mockStorage)
    assert.equal(mockStorage.getItem(CHUNK_RELOAD_COUNT_KEY), '1')

    // Immediately after: cannot reload again within cooldown
    assert.equal(canAutoReload(mockStorage), false)

    // Resetting clears the lock
    resetAutoReload(mockStorage)
    assert.equal(canAutoReload(mockStorage), true)
  })

  it('4. retryDynamicImport succeeds after transient in-memory retry', async () => {
    let callCount = 0
    const mockImporter = async () => {
      callCount++
      if (callCount === 1) {
        throw new TypeError('Failed to fetch dynamically imported module: test-chunk.js')
      }
      return { default: 'ModuleSuccess' }
    }

    const mod = await retryDynamicImport(mockImporter, 2, 10, { window: null, storage: null })
    assert.equal(callCount, 2)
    assert.equal(mod.default, 'ModuleSuccess')
  })

  it('5. retryDynamicImport triggers controlled reload on persistent chunk failure', async () => {
    const memoryStorage = new Map()
    const mockStorage = {
      getItem: (key) => memoryStorage.get(key) || null,
      setItem: (key, val) => memoryStorage.set(key, String(val)),
      removeItem: (key) => memoryStorage.delete(key),
    }

    let reloaded = false
    const mockWindow = {
      location: {
        reload: () => {
          reloaded = true
        },
      },
    }

    const failingImporter = async () => {
      throw new TypeError('Failed to fetch dynamically imported module: https://bisnissehat.my.id/assets/MarginAnalysis-CInUbDpa.js')
    }

    // First time: should trigger reload and return pending promise
    const _pendingPromise = retryDynamicImport(failingImporter, 1, 5, {
      window: mockWindow,
      storage: mockStorage,
    })

    // Give microtasks time to run
    await new Promise((r) => setTimeout(r, 25))

    assert.equal(reloaded, true)
    assert.equal(mockStorage.getItem(CHUNK_RELOAD_COUNT_KEY), '1')

    // Second time (stale reload limit reached): should throw directly to ErrorBoundary instead of reloading again
    reloaded = false
    await assert.rejects(
      async () => {
        await retryDynamicImport(failingImporter, 0, 5, {
          window: mockWindow,
          storage: mockStorage,
        })
      },
      {
        message: /Failed to fetch dynamically imported module/,
      }
    )
    assert.equal(reloaded, false) // Did not reload again!
  })

  it('6. registerVitePreloadErrorHandler registers listeners and handles vite:preloadError', () => {
    const memoryStorage = new Map()
    const mockStorage = {
      getItem: (key) => memoryStorage.get(key) || null,
      setItem: (key, val) => memoryStorage.set(key, String(val)),
      removeItem: (key) => memoryStorage.delete(key),
    }

    const listeners = {}
    let reloadCalled = false
    const mockWindow = {
      addEventListener: (type, fn) => {
        listeners[type] = fn
      },
      location: {
        reload: () => {
          reloadCalled = true
        },
      },
    }

    registerVitePreloadErrorHandler(mockWindow, mockStorage)

    assert.ok(typeof listeners['vite:preloadError'] === 'function')
    assert.ok(typeof listeners['unhandledrejection'] === 'function')
    assert.ok(typeof listeners['error'] === 'function')

    let prevented = false
    const fakeEvent = {
      payload: new Error('Failed to fetch dynamically imported module: foo.js'),
      preventDefault: () => {
        prevented = true
      },
    }

    listeners['vite:preloadError'](fakeEvent)
    assert.equal(prevented, true)
    assert.equal(reloadCalled, true)
    assert.equal(mockStorage.getItem(CHUNK_RELOAD_COUNT_KEY), '1')
  })

  it('7. index.html contains early inline recovery script and cache control headers', () => {
    const indexPath = path.resolve('index.html')
    const indexContent = fs.readFileSync(indexPath, 'utf8')

    assert.ok(indexContent.includes('bs_chunk_retry_timestamp'), 'Must configure inline chunk retry key')
    assert.ok(indexContent.includes('vite:preloadError'), 'Must listen to vite:preloadError in index.html head')
    assert.ok(indexContent.includes('unhandledrejection'), 'Must listen to unhandledrejection in index.html head')
    assert.ok(indexContent.includes("t.tagName === 'SCRIPT'"), 'Must intercept script load errors')
    assert.ok(indexContent.includes('no-cache, no-store, must-revalidate'), 'Must set Cache-Control meta')
  })

  it('8. vercel.json preserves assets immutable caching and exempts assets from rewrite', () => {
    const vercelPath = path.resolve('vercel.json')
    const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'))

    // Assets header check
    const assetHeader = vercelConfig.headers.find((h) => h.source === '/assets/(.*)')
    assert.ok(assetHeader, 'Must configure /assets/(.*) headers')
    const assetCache = assetHeader.headers.find((h) => h.key === 'Cache-Control')
    assert.ok(assetCache.value.includes('immutable'), 'Assets must be immutable cached')

    // sw.js header check
    const swHeader = vercelConfig.headers.find((h) => h.source === '/sw.js')
    assert.ok(swHeader, 'Must configure /sw.js header')
    const swCache = swHeader.headers.find((h) => h.key === 'Cache-Control')
    assert.ok(swCache.value.includes('no-cache'), 'sw.js must be no-cache')

    // SPA rewrite check: must NOT rewrite /assets/ to index.html
    const spaRewrite = vercelConfig.rewrites.find((r) => r.destination === '/index.html')
    assert.ok(spaRewrite, 'Must have SPA rewrite to /index.html')
    assert.ok(spaRewrite.source.includes('assets/'), 'Rewrite pattern must exclude assets/ directory')
  })

  it('9. App.jsx uses lazy with retry for all dynamic route pages', () => {
    const appPath = path.resolve('src/App.jsx')
    const appContent = fs.readFileSync(appPath, 'utf8')

    assert.ok(
      appContent.includes("import { lazy } from './lib/chunkRetry'"),
      'App.jsx must import lazy from ./lib/chunkRetry'
    )
    assert.ok(
      !appContent.includes("import { lazy, Suspense } from 'react'"),
      'App.jsx must not use raw React.lazy'
    )
  })

  it('10. ErrorBoundary provides branded chunk error fallback UI', () => {
    const errorBoundaryPath = path.resolve('src/components/ErrorBoundary.jsx')
    const errorBoundaryContent = fs.readFileSync(errorBoundaryPath, 'utf8')

    assert.ok(errorBoundaryContent.includes('isChunkLoadError'), 'ErrorBoundary must use isChunkLoadError')
    assert.ok(errorBoundaryContent.includes('Aplikasi baru saja diperbarui'), 'Must display updated app banner')
    assert.ok(errorBoundaryContent.includes('resetAutoReload'), 'Must provide manual reload resetting circuit breaker')
  })
})
