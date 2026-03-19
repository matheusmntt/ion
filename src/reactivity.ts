import { EffectCallback } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler
// ─────────────────────────────────────────────────────────────────────────────

let queue = new Set<() => void>()
let scheduled = false
let flushDepth = 0
const MAX_FLUSH_DEPTH = 100

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
          `[reactivity] Reactive loop detected: more than ${MAX_FLUSH_DEPTH} nested flush cycles.`
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

export let activeEffect: ActiveEffect | null = null

export interface ActiveEffect {
  run(): void
  cleanups: Set<() => void>
}

export function effect(callback: EffectCallback): () => void {
  const deps = new Set<Set<ActiveEffect>>()

  const self: ActiveEffect = {
    cleanups: new Set(),

    run() {
      deps.forEach((dep) => dep.delete(self))
      deps.clear()
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
// Raw value registry
// Maps proxy → original raw object so we can unwrap before storing.
// ─────────────────────────────────────────────────────────────────────────────
const rawMap = new WeakMap<object, object>()

/**
 * Returns the raw (non-proxy) version of a value.
 * If the value was never proxied, returns it as-is.
 */
export function toRaw<T>(value: T): T {
  if (typeof value === "object" && value !== null && rawMap.has(value as object)) {
    return rawMap.get(value as object) as T
  }
  return value
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep reactive proxy
// ─────────────────────────────────────────────────────────────────────────────

const effectMap = new WeakMap<object, Map<PropertyKey, Set<ActiveEffect>>>()

function getEffectSet(target: object, prop: PropertyKey): Set<ActiveEffect> {
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

const proxyCache = new WeakMap<object, object>()

export function deepReactive<T extends object>(
  obj: T,
  notify: (prop: PropertyKey, value: unknown) => void
): T {
  if (typeof obj !== "object" || obj === null) {
    return obj
  }

  // If obj is already a proxy, return it directly
  if (rawMap.has(obj)) {
    return obj
  }

  if (proxyCache.has(obj)) {
    return proxyCache.get(obj) as T
  }

  const proxy = new Proxy(obj, {
    get(target, prop: PropertyKey) {
      const value = (target as any)[prop]

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
      // Unwrap proxy before storing — prevents proxy-of-proxy chains
      const rawValue = toRaw(value)
      const prev = (target as any)[prop]

      if (prev === rawValue) return true

      ;(target as any)[prop] = rawValue

      notify(prop, rawValue)

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
  rawMap.set(proxy, obj)   // register so toRaw() can unwrap it

  return proxy
}
