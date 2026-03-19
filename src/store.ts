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
  /** Optional list of prop names this computed depends on (for targeted invalidation). */
  deps?: (keyof T)[]
}

export interface StoreOptions<T extends State> {
  computed?: Record<string, ((state: T) => unknown) | ComputedDefinition<T>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

export interface Store<T extends State> {
  /** The reactive state object. Mutate properties directly to trigger updates. */
  state: T

  /**
   * Subscribe to any state change.
   * The callback receives the full (updated) state.
   * Returns an unsubscribe function.
   */
  subscribe(fn: Subscriber<T>): Cleanup

  /**
   * Subscribe to any state change with full change details.
   * Receives (prop, value, state).
   * Returns an unsubscribe function.
   */
  onChange(fn: ChangeListener<T>): Cleanup

  /**
   * Watch a specific property path (dot-notation supported).
   * Callback fires whenever the value at that path changes.
   *
   * @example
   * store.watch('user.name', (value) => console.log(value))
   */
  watch(path: string, callback: WatchCallback<T>): Cleanup
}

// ─────────────────────────────────────────────────────────────────────────────
// Computed cache helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ComputedEntry {
  value: unknown
  /** Props that were accessed during last compute (auto-tracked) */
  deps: Set<PropertyKey>
  dirty: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Path resolution
// ─────────────────────────────────────────────────────────────────────────────

function resolvePath(path: string, obj: any): unknown {
  return path.split(".").reduce((acc, key) => acc?.[key], obj)
}

/**
 * Resolves the root key of a dot-path (e.g. "user.name" → "user").
 */
function rootKey(path: string): string {
  return path.split(".")[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// createStore
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a reactive store with the given initial state and options.
 *
 * @example
 * const store = createStore({ count: 0, user: { name: 'Ana' } })
 *
 * store.subscribe((state) => console.log('changed:', state))
 * store.watch('user.name', (value) => console.log('name is now', value))
 *
 * store.state.count++
 * store.state.user.name = 'João'
 */
export function createStore<T extends State>(
  initialState: T,
  options: StoreOptions<T> = {}
): Store<T> {
  const subscribers = new Set<Subscriber<T>>()
  const changeListeners = new Set<ChangeListener<T>>()

  // path → Set<WatchCallback>
  const watchers = new Map<string, Set<WatchCallback<T>>>()

  // Snapshot of watched paths for diff detection
  const watchedValues = new Map<string, unknown>()

  // Computed cache: key → entry
  const computedCache = new Map<string, ComputedEntry>()

  // ── Notify ──────────────────────────────────────────────────────────────────

  function notify(prop: PropertyKey, value: unknown): void {
    const propStr = String(prop)

    // Subscribers (simple)
    subscribers.forEach((fn) => {
      queueNotification(() => fn(proxy))
    })

    // Change listeners (full)
    changeListeners.forEach((fn) => {
      queueNotification(() => fn(prop, value, proxy))
    })

    // Invalidate computed entries that depend on this prop
    computedCache.forEach((entry) => {
      if (entry.deps.has(prop)) {
        entry.dirty = true
      }
    })

    // Watchers — check every watched path whose root matches the changed prop
    watchers.forEach((callbacks, path) => {
      if (rootKey(path) !== propStr && path !== propStr) return

      const current = resolvePath(path, proxy)
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
      const getFn =
        typeof definition === "function" ? definition : definition.get

      computedCache.set(key, { value: undefined, deps: new Set(), dirty: true })

      Object.defineProperty(proxy, key, {
        enumerable: true,
        configurable: true,
        get() {
          const entry = computedCache.get(key)!

          if (entry.dirty) {
            // Intercept property accesses to auto-track deps
            const accessed = new Set<PropertyKey>()
            const tracker = new Proxy(proxy as any, {
              get(t, p) {
                accessed.add(p)
                return (t as any)[p]
              },
            })

            entry.value = getFn(tracker as T)
            entry.deps = accessed
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

      // Store initial value for diffing
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
