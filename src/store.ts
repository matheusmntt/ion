import {
  deepReactive,
  queueNotification,
  Reaction,
  toRaw,
  trigger,
  untracked,
} from "./reactivity"
import { inspector } from "./inspector"
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
  /** Name shown by inspectors. `App.store()` sets it for you. */
  name?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

export interface Store<T extends State> {
  readonly id: number
  readonly name: string | null
  state: T
  subscribe(fn: Subscriber<T>): Cleanup
  onChange(fn: ChangeListener<T>): Cleanup
  watch(path: string, callback: WatchCallback<T>): Cleanup
}

// ─────────────────────────────────────────────────────────────────────────────
// Path helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolvePath(path: string, obj: any): unknown {
  return path.split(".").reduce((acc, key) => acc?.[key], obj)
}

// ─────────────────────────────────────────────────────────────────────────────
// createStore
// ─────────────────────────────────────────────────────────────────────────────

let nextStoreId = 1

export function createStore<T extends State>(
  initialState: T,
  options: StoreOptions<T> = {}
): Store<T> {
  const id = nextStoreId++
  const name = options.name ?? null
  const subscribers     = new Set<Reaction>()
  const changeListeners = new Set<ChangeListener<T>>()

  if (inspector) inspector.storeCreate?.({ id, name })

  // ── Notify ──────────────────────────────────────────────────────────────────
  // Store-wide listeners. Effects, bindings, computeds and watchers are not
  // notified here: they are triggered by the exact keys they read.

  function notify(prop: PropertyKey, value: unknown, path: string[]): void {
    subscribers.forEach((reaction) => reaction.notify())
    changeListeners.forEach((fn) => {
      queueNotification(() => fn(prop, value, proxy, path))
    })
  }

  // ── Proxy ───────────────────────────────────────────────────────────────────

  const proxy = deepReactive(initialState, notify, { storeId: id })
  const raw = toRaw(proxy)

  // ── Computed ────────────────────────────────────────────────────────────────
  // Lazy and cached. A computed records what it reads while evaluating; when
  // one of those keys changes it is marked dirty and the reactions that read
  // the computed are triggered, so they re-read it on their next run.

  if (options.computed) {
    for (const key of Object.keys(options.computed)) {
      const definition = options.computed[key]
      const getFn = typeof definition === "function" ? definition : definition.get

      let value: unknown
      let dirty = true

      const reaction: Reaction = new Reaction(() => getFn(proxy), {
        kind: "computed",
        label: key,
        storeId: id,
        path: key,
        scheduler() {
          if (dirty) return
          dirty = true
          if (inspector) inspector.invalidate?.(reaction.info)
          trigger(raw, key)
        },
      })

      Object.defineProperty(raw, key, {
        enumerable: true,
        configurable: true,
        get() {
          if (dirty) {
            value = reaction.run()
            dirty = false
          }
          return value
        },
      })
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    id,
    name,
    state: proxy,

    subscribe(fn) {
      const reaction = new Reaction(() => fn(proxy), {
        kind: "subscriber",
        label: fn.name || "subscriber",
        storeId: id,
        untracked: true,
      })
      subscribers.add(reaction)
      return () => {
        reaction.stop()
        subscribers.delete(reaction)
      }
    },

    onChange(fn) {
      changeListeners.add(fn)
      return () => changeListeners.delete(fn)
    },

    watch(path, callback) {
      let last: unknown
      let initialized = false

      const reaction = new Reaction(
        () => {
          const current = resolvePath(path, proxy)
          if (!initialized) {
            initialized = true
            last = current
            return
          }
          if (current === last) return
          last = current
          untracked(() => callback(current, proxy))
        },
        { kind: "watch", label: `watch("${path}")`, storeId: id, path }
      )

      reaction.run()
      return () => reaction.stop()
    },
  }
}
