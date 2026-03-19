import { deepReactive, queueNotification } from "./reactivity"
import {
  State,
  Subscriber,
  ChangeListener,
  WatchCallback,
  Cleanup,
} from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Store options
// ─────────────────────────────────────────────────────────────────────────────

export interface ComputedDefinition<T extends State> {
  get: (state: T) => unknown
}

export interface StoreOptions<T extends State> {
  computed?: Record<string, ((state: T) => unknown) | ComputedDefinition<T>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

export interface Store<T extends State> {
  state: T
  subscribe(fn: Subscriber<T>): Cleanup
  onChange(fn: ChangeListener<T>): Cleanup
  watch(path: string, callback: WatchCallback<T>): Cleanup
}

// ─────────────────────────────────────────────────────────────────────────────
// Computed cache
// ─────────────────────────────────────────────────────────────────────────────

interface ComputedEntry {
  value: unknown
  dirty: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Path helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolvePath(path: string, obj: any): unknown {
  return path.split(".").reduce((acc, key) => acc?.[key], obj)
}

function rootKey(path: string): string {
  return path.split(".")[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// createStore
// ─────────────────────────────────────────────────────────────────────────────

export function createStore<T extends State>(
  initialState: T,
  options: StoreOptions<T> = {}
): Store<T> {
  const subscribers    = new Set<Subscriber<T>>()
  const changeListeners = new Set<ChangeListener<T>>()
  const watchers       = new Map<string, Set<WatchCallback<T>>>()
  const watchedValues  = new Map<string, unknown>()
  const computedCache  = new Map<string, ComputedEntry>()

  // ── Notify ──────────────────────────────────────────────────────────────────

  function notify(prop: PropertyKey, value: unknown): void {
    const propStr = String(prop)

    // Subscribers
    subscribers.forEach((fn) => {
      queueNotification(() => fn(proxy))
    })

    // Change listeners
    changeListeners.forEach((fn) => {
      queueNotification(() => fn(prop, value, proxy))
    })

    // Invalidate ALL computed entries on every mutation.
    // Simpler and correct: computed values are lazy (recalculate only on read),
    // so marking everything dirty costs nothing unless the value is actually read.
    // The previous dep-tracking approach had a bug where deps were never populated
    // on the first run, causing stale cached values after the first mutation.
    computedCache.forEach((entry) => {
      entry.dirty = true
    })

    // Watchers
    watchers.forEach((callbacks, path) => {
      if (rootKey(path) !== propStr && path !== propStr) return

      const current  = resolvePath(path, proxy)
      const previous = watchedValues.get(path)

      if (current !== previous) {
        watchedValues.set(path, current)
        callbacks.forEach((fn) => {
          queueNotification(() => fn(current, proxy))
        })
      }
    })
  }

  // ── Proxy ───────────────────────────────────────────────────────────────────

  const proxy = deepReactive(initialState, notify)

  // ── Computed ────────────────────────────────────────────────────────────────

  if (options.computed) {
    for (const key of Object.keys(options.computed)) {
      const definition = options.computed[key]
      const getFn = typeof definition === "function" ? definition : definition.get

      computedCache.set(key, { value: undefined, dirty: true })

      Object.defineProperty(proxy, key, {
        enumerable: true,
        configurable: true,
        get() {
          const entry = computedCache.get(key)!
          if (entry.dirty) {
            entry.value = getFn(proxy as T)
            entry.dirty = false
          }
          return entry.value
        },
      })
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    state: proxy,

    subscribe(fn) {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },

    onChange(fn) {
      changeListeners.add(fn)
      return () => changeListeners.delete(fn)
    },

    watch(path, callback) {
      if (!watchers.has(path)) {
        watchers.set(path, new Set())
      }
      watchedValues.set(path, resolvePath(path, proxy))
      watchers.get(path)!.add(callback)

      return () => {
        watchers.get(path)?.delete(callback)
        if (watchers.get(path)?.size === 0) {
          watchers.delete(path)
          watchedValues.delete(path)
        }
      }
    },
  }
}
