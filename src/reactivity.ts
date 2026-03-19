import { EffectCallback, type Cleanup } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler
// ─────────────────────────────────────────────────────────────────────────────

let queue = new Set<() => void>()
let scheduled = false
let flushDepth = 0
const MAX_FLUSH_DEPTH = 100

/**
 * Schedules a function to run in the next microtask.
 * Deduplicates identical function references within the same flush cycle.
 * Throws if reactive loops are detected (depth > MAX_FLUSH_DEPTH).
 */
export function schedule(fn: () => void): void {
  queue.add(fn)

  if (!scheduled) {
    scheduled = true

    queueMicrotask(() => {
      flushDepth++

      if (flushDepth > MAX_FLUSH_DEPTH) {
        flushDepth = 0
        queue.clear()
        scheduled = false
        throw new Error(
          `[reactivity] Reactive loop detected: more than ${MAX_FLUSH_DEPTH} ` +
          `nested flush cycles. A subscriber is likely mutating state during notification.`
        )
      }

      const current = new Set(queue)
      queue.clear()
      scheduled = false

      current.forEach((f) => f())

      flushDepth = 0
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch
// ─────────────────────────────────────────────────────────────────────────────

let batchDepth = 0
let batchedNotifications: Array<() => void> = []

/**
 * Batches multiple state mutations into a single notification cycle.
 * Nested batch() calls are safe — notifications flush only when the
 * outermost batch completes.
 *
 * @example
 * batch(() => {
 *   store.state.firstName = 'Ana'
 *   store.state.lastName  = 'Lima'
 * })
 * // subscribers notified once, not twice
 */
export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      const pending = batchedNotifications.slice()
      batchedNotifications = []
      pending.forEach((notify) => notify())
    }
  }
}

/**
 * Queues a notification, respecting the current batch depth.
 * Internal — called from deepReactive's notify.
 */
export function queueNotification(fn: () => void): void {
  if (batchDepth > 0) {
    batchedNotifications.push(fn)
  } else {
    schedule(fn)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Effect tracking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The currently running effect, if any.
 * deepReactive's get trap registers accessed props into this set.
 */
export let activeEffect: ActiveEffect | null = null

export interface ActiveEffect {
  /** Called to re-execute the effect */
  run(): void
  /** Set of cleanup callbacks from the previous run */
  cleanups: Set<() => void>
}

/**
 * Creates a self-tracking reactive effect.
 *
 * The callback runs immediately. Any reactive properties read during execution
 * are tracked as dependencies. When those properties change, the callback
 * re-runs automatically. If the callback returns a function, that function
 * is called before each re-run and on final cleanup.
 *
 * @returns A stop function that permanently disables the effect.
 *
 * @example
 * const stop = effect(() => {
 *   document.title = store.state.title
 * })
 */
export function effect(callback: EffectCallback): Cleanup {
  const deps = new Set<Set<ActiveEffect>>()

  const self: ActiveEffect = {
    cleanups: new Set(),

    run() {
      // Unsubscribe from all previous deps before re-tracking
      deps.forEach((dep) => dep.delete(self))
      deps.clear()

      // Run any cleanup returned by the previous execution
      self.cleanups.forEach((c) => c())
      self.cleanups.clear()

      const prev = activeEffect
      activeEffect = self

      try {
        const result = callback()
        if (typeof result === "function") {
          self.cleanups.add(result)
        }
      } finally {
        activeEffect = prev
      }
    },
  }

  // Allow deepReactive to register deps on this effect
  ;(self as any)._deps = deps

  self.run()

  return () => {
    deps.forEach((dep) => dep.delete(self))
    deps.clear()
    self.cleanups.forEach((c) => c())
    self.cleanups.clear()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep reactive proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-object, per-property set of active effects.
 * Structure: WeakMap<object, Map<prop, Set<ActiveEffect>>>
 */
const effectMap = new WeakMap<object, Map<PropertyKey, Set<ActiveEffect>>>()

function getEffectSet(
  target: object,
  prop: PropertyKey
): Set<ActiveEffect> {
  let propMap = effectMap.get(target)
  if (!propMap) {
    propMap = new Map()
    effectMap.set(target, propMap)
  }
  let effects = propMap.get(prop)
  if (!effects) {
    effects = new Set()
    propMap.set(prop, effects)
  }
  return effects
}

/**
 * Cache of proxies — prevents creating a new Proxy on every property access.
 * Without this, `store.state.user === store.state.user` would be false.
 */
const proxyCache = new WeakMap<object, object>()

/**
 * Creates a deeply reactive proxy of an object.
 * Uses a WeakMap cache so the same object always returns the same proxy.
 *
 * @param obj     Target object to wrap
 * @param notify  Callback invoked on mutations (prop, value)
 */
export function deepReactive<T extends object>(
  obj: T,
  notify: (prop: PropertyKey, value: unknown) => void
): T {
  if (typeof obj !== "object" || obj === null) {
    return obj
  }

  if (proxyCache.has(obj)) {
    return proxyCache.get(obj) as T
  }

  const proxy = new Proxy(obj, {
    get(target, prop: PropertyKey) {
      const value = (target as any)[prop]

      // Track dependency for the currently running effect
      if (activeEffect !== null) {
        const effects = getEffectSet(target, prop)
        effects.add(activeEffect)
        ;(activeEffect as any)._deps.add(effects)
      }

      if (typeof value === "object" && value !== null) {
        return deepReactive(value, notify)
      }

      return value
    },

    set(target, prop: PropertyKey, value) {
      const prev = (target as any)[prop]
      if (prev === value) return true

      ;(target as any)[prop] = value

      // Notify store subscribers
      notify(prop, value)

      // Re-run any effects that depend on this property
      const effects = effectMap.get(target)?.get(prop)
      if (effects && effects.size > 0) {
        effects.forEach((eff) => queueNotification(() => eff.run()))
      }

      return true
    },

    deleteProperty(target, prop: PropertyKey) {
      if (!(prop in target)) return true
      delete (target as any)[prop]
      notify(prop, undefined)
      return true
    },
  })

  proxyCache.set(obj, proxy)

  return proxy
}
