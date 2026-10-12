import { EffectCallback } from "./types"
import { inspector, Lane, ReactionInfo, ReactionKind } from "./inspector"

// ─────────────────────────────────────────────────────────────────────────────
// Error reporting
// A throwing job must not stop the rest of the flush, so errors are reported
// (window "error" event in browsers, console elsewhere) instead of rethrown.
// ─────────────────────────────────────────────────────────────────────────────

function report(error: unknown): void {
  const scope = globalThis as { reportError?: (error: unknown) => void }
  if (typeof scope.reportError === "function") scope.reportError(error)
  else console.error(error)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reactions
// A reaction is anything Ion can schedule: effects, bindings, computeds,
// store subscribers and watchers. Each one is a stable object, which is what
// lets the scheduler run it at most once per flush.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReactionOptions
  extends Partial<Pick<ReactionInfo, "storeId" | "directive" | "path" | "element">> {
  kind?: ReactionKind
  label?: string
  /** Called instead of queueing a re-run when a dependency changes. */
  scheduler?: () => void
  /** Runs without collecting dependencies (store-wide subscribers). */
  untracked?: boolean
}

let nextReactionId = 1
let activeReaction: Reaction | null = null

export class Reaction {
  readonly info: ReactionInfo
  readonly deps = new Set<Set<Reaction>>()
  readonly cleanups = new Set<() => void>()
  active = true

  private readonly fn: () => unknown
  private readonly scheduler: (() => void) | undefined
  private readonly untracked: boolean

  constructor(fn: () => unknown, options: ReactionOptions = {}) {
    const { kind = "effect", label, scheduler, untracked = false, ...meta } = options
    const id = nextReactionId++

    this.fn = fn
    this.scheduler = scheduler
    this.untracked = untracked
    this.info = { id, kind, label: label ?? `${kind}#${id}`, ...meta }

    if (inspector) inspector.reactionCreate?.(this.info)
  }

  /** Runs the reaction, re-collecting its dependencies from scratch. */
  run(): unknown {
    if (!this.active) return undefined

    this.reset()
    const prev = activeReaction
    activeReaction = this.untracked ? null : this
    if (inspector) inspector.runStart?.(this.info)

    let error: unknown
    try {
      return this.fn()
    } catch (e) {
      error = e
      throw e
    } finally {
      activeReaction = prev
      if (inspector) inspector.runEnd?.(this.info, error)
    }
  }

  /** Called when one of the reaction's dependencies changes. */
  notify(): void {
    if (!this.active) return
    if (this.scheduler) this.scheduler()
    else enqueue(this)
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    this.reset()
    queue.delete(this)
    batchQueue.delete(this)
    if (inspector) inspector.reactionDispose?.(this.info)
  }

  private reset(): void {
    this.deps.forEach((dep) => dep.delete(this))
    this.deps.clear()
    this.cleanups.forEach((cleanup) => cleanup())
    this.cleanups.clear()
  }
}

/** Runs `fn` without letting the active reaction track what it reads. */
export function untracked<T>(fn: () => T): T {
  const prev = activeReaction
  activeReaction = null
  try {
    return fn()
  } finally {
    activeReaction = prev
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler
// Jobs are queued in a Set, so a reaction triggered by several writes in the
// same tick still runs once. Jobs queued while a flush is running are picked
// up by the same flush in a new round; too many rounds means a loop.
// ─────────────────────────────────────────────────────────────────────────────

type Job = Reaction | (() => void)

const MAX_FLUSH_ROUNDS = 100

const queue = new Set<Job>()
const batchQueue = new Set<Job>()
let flushPending = false
let flushing = false
let batchDepth = 0
/** Jobs of the round currently running that have not run yet. */
let currentRound: Set<Job> | null = null

function labelOf(job: Job): string {
  return typeof job === "function" ? job.name || "anonymous job" : job.info.label
}

function runJob(job: Job): void {
  try {
    if (typeof job === "function") job()
    else job.run()
  } catch (error) {
    report(error)
  }
}

function runRound(jobs: Set<Job>): void {
  const outer = currentRound
  currentRound = jobs
  try {
    for (const job of jobs) {
      jobs.delete(job)
      runJob(job)
    }
  } finally {
    currentRound = outer
  }
}

function flush(): void {
  flushPending = false
  flushing = true
  let round = 0

  try {
    while (queue.size > 0) {
      if (++round > MAX_FLUSH_ROUNDS) {
        const culprits = Array.from(queue, labelOf).join(", ")
        queue.clear()
        report(
          new Error(
            `[ion] Reactive loop detected: updates were still re-triggering after ${MAX_FLUSH_ROUNDS} rounds (${culprits}).`
          )
        )
        break
      }

      const jobs = new Set(queue)
      queue.clear()
      if (inspector) inspector.flushStart?.({ lane: "microtask", round })
      runRound(jobs)
      if (inspector) inspector.flushEnd?.({ lane: "microtask" })
    }
  } finally {
    flushing = false
  }
}

function enqueue(job: Job, lane: Lane = batchDepth > 0 ? "batch" : "microtask"): void {
  const target = lane === "batch" ? batchQueue : queue
  const deduped = target.has(job) || (currentRound !== null && currentRound.has(job))

  if (!deduped) target.add(job)
  if (inspector && typeof job !== "function") {
    inspector.enqueue?.({ reaction: job.info, lane, deduped })
  }

  if (lane === "microtask" && !flushing && !flushPending) {
    flushPending = true
    queueMicrotask(flush)
  }
}

/** Queues a function for the next microtask flush. Identical functions run once. */
export function schedule(fn: () => void): void {
  enqueue(fn, "microtask")
}

/** Queues a notification, honouring an active `batch()`. */
export function queueNotification(fn: () => void): void {
  enqueue(fn)
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch
// Notifications raised inside a batch are collected (and deduplicated) and run
// synchronously when the outermost batch returns, instead of in a microtask.
// ─────────────────────────────────────────────────────────────────────────────

export function batch(fn: () => void): void {
  batchDepth++
  if (batchDepth === 1 && inspector) inspector.batchStart?.()

  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      if (inspector) inspector.batchEnd?.()
      if (batchQueue.size > 0) {
        const jobs = new Set(batchQueue)
        batchQueue.clear()
        if (inspector) inspector.flushStart?.({ lane: "batch", round: 1 })
        runRound(jobs)
        if (inspector) inspector.flushEnd?.({ lane: "batch" })
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Effect
// ─────────────────────────────────────────────────────────────────────────────

export interface EffectOptions {
  /** Name shown by inspectors and in loop-detection errors. */
  label?: string
}

export function effect(callback: EffectCallback, options: EffectOptions = {}): () => void {
  const reaction: Reaction = new Reaction(
    () => {
      const result = callback()
      if (typeof result === "function") reaction.cleanups.add(result)
    },
    { kind: "effect", ...(options.label ? { label: options.label } : {}) }
  )

  reaction.run()
  return () => reaction.stop()
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency tracking
// Dependencies are recorded per (raw object, key). ITERATE_KEY stands for
// "the set of keys of this object" (Object.keys, for…in, spreading).
// ─────────────────────────────────────────────────────────────────────────────

const ITERATE_KEY = Symbol("iterate")
const targetMap = new WeakMap<object, Map<PropertyKey, Set<Reaction>>>()

export function track(target: object, key: PropertyKey, storeId: number, path: string[]): void {
  const reaction = activeReaction
  if (!reaction) return
  if (typeof key === "symbol" && key !== ITERATE_KEY) return

  let depsMap = targetMap.get(target)
  if (!depsMap) targetMap.set(target, (depsMap = new Map()))

  let dep = depsMap.get(key)
  if (!dep) depsMap.set(key, (dep = new Set()))

  if (dep.has(reaction)) return
  dep.add(reaction)
  reaction.deps.add(dep)

  if (inspector) {
    inspector.track?.({
      reaction: reaction.info,
      storeId,
      path: [...path, key === ITERATE_KEY ? "*" : String(key)],
    })
  }
}

export function trigger(target: object, key: PropertyKey): void {
  const dep = targetMap.get(target)?.get(key)
  if (!dep || dep.size === 0) return

  for (const reaction of Array.from(dep)) {
    // A reaction never re-triggers itself (e.g. an effect doing `count++`)
    if (reaction === activeReaction) continue
    reaction.notify()
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

export type Notify = (prop: PropertyKey, value: unknown, path: string[]) => void

export interface ReactiveOptions {
  /** Store id reported to inspectors. */
  storeId?: number
}

interface Owner {
  notify: Notify
  storeId: number
  /** Proxies are cached per owner, so two stores sharing an object both get notified. */
  cache: WeakMap<object, object>
}

const owners = new WeakMap<Notify, Owner>()

/** Only plain objects and arrays are made reactive; Date, Map, DOM nodes… are left alone. */
function isReactable(value: unknown): value is object {
  if (typeof value !== "object" || value === null) return false
  const tag = Object.prototype.toString.call(value)
  return tag === "[object Object]" || tag === "[object Array]"
}

function isIndex(key: PropertyKey): boolean {
  return typeof key === "string" && key !== "" && String(Number(key) >>> 0) === key
}

function hasOwn(target: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(target, key)
}

export function deepReactive<T extends object>(
  obj: T,
  notify: Notify,
  options: ReactiveOptions = {}
): T {
  if (!isReactable(obj)) return obj

  // If obj is already a proxy, return it directly
  if (rawMap.has(obj)) return obj

  let owner = owners.get(notify)
  if (!owner) {
    owner = { notify, storeId: options.storeId ?? 0, cache: new WeakMap() }
    owners.set(notify, owner)
  }

  return wrap(obj, owner, [])
}

function wrap<T extends object>(obj: T, owner: Owner, path: string[]): T {
  const cached = owner.cache.get(obj)
  if (cached) return cached as T

  const isArray = Array.isArray(obj)
  const { storeId } = owner

  const proxy = new Proxy(obj, {
    get(target, prop) {
      const value = (target as any)[prop]
      track(target, prop, storeId, path)

      if (isReactable(value) && !rawMap.has(value)) {
        return owner.cache.get(value) ?? wrap(value, owner, [...path, String(prop)])
      }
      return value
    },

    set(target, prop, value) {
      // Unwrap proxy before storing — prevents proxy-of-proxy chains
      const raw = toRaw(value)
      const hadKey = isArray && isIndex(prop)
        ? Number(prop) < (target as unknown[]).length
        : hasOwn(target, prop)
      const prev = (target as any)[prop]

      if (hadKey && Object.is(prev, raw)) {
        if (inspector) inspector.writeSkipped?.({ storeId, path: [...path, String(prop)], value: raw })
        return true
      }

      const oldLength = isArray ? (target as unknown[]).length : 0
      ;(target as any)[prop] = raw

      const fullPath = [...path, String(prop)]
      if (inspector) {
        inspector.commit?.({ storeId, path: fullPath, prev, next: raw, op: hadKey ? "set" : "add" })
      }

      owner.notify(prop, raw, fullPath)
      trigger(target, prop)

      if (isArray) {
        const newLength = (target as unknown[]).length
        if (prop === "length") {
          // Truncation: items past the new length are gone
          targetMap.get(target)?.forEach((_, key) => {
            if (isIndex(key) && Number(key) >= newLength) trigger(target, key)
          })
        } else if (newLength !== oldLength) {
          trigger(target, "length")
        }
      } else if (!hadKey) {
        trigger(target, ITERATE_KEY)
      }

      return true
    },

    deleteProperty(target, prop) {
      if (!hasOwn(target, prop)) return true

      const prev = (target as any)[prop]
      delete (target as any)[prop]

      const fullPath = [...path, String(prop)]
      if (inspector) inspector.commit?.({ storeId, path: fullPath, prev, next: undefined, op: "delete" })

      owner.notify(prop, undefined, fullPath)
      trigger(target, prop)
      if (!isArray) trigger(target, ITERATE_KEY)
      return true
    },

    has(target, prop) {
      track(target, prop, storeId, path)
      return Reflect.has(target, prop)
    },

    ownKeys(target) {
      track(target, isArray ? "length" : ITERATE_KEY, storeId, path)
      return Reflect.ownKeys(target)
    },
  })

  owner.cache.set(obj, proxy)
  rawMap.set(proxy, obj) // register so toRaw() can unwrap it

  return proxy
}
