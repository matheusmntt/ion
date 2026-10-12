// ─────────────────────────────────────────────────────────────────────────────
// Inspector
//
// An optional observer of Ion's internals, intended for devtools, tests and
// visualizations. When no inspector is installed every call site is skipped
// by a single null check, so it costs nothing in production.
// ─────────────────────────────────────────────────────────────────────────────

export type ReactionKind = "effect" | "binding" | "computed" | "subscriber" | "watch"

/** Stable description of a reaction (anything Ion can schedule and re-run). */
export interface ReactionInfo {
  readonly id: number
  readonly kind: ReactionKind
  readonly label: string
  /** Store that owns the reaction (bindings, computeds, subscribers, watchers). */
  readonly storeId?: number
  /** Bindings only: the directive name without the `data-` prefix. */
  readonly directive?: string
  /** Bindings and watchers: the state path they read. */
  readonly path?: string
  /** Bindings only: the element the directive is attached to. */
  readonly element?: Element
}

export interface StoreInfo {
  readonly id: number
  readonly name: string | null
}

export type DomChannel = "text" | "hidden" | "attr" | "class" | "value" | "checked"
export type Lane = "microtask" | "batch"

export interface CommitEvent {
  storeId: number
  path: string[]
  prev: unknown
  next: unknown
  op: "set" | "add" | "delete"
}

export interface DomWriteEvent {
  reaction: ReactionInfo
  element: Element
  channel: DomChannel
  /** Attribute or class name for `attr` / `class` channels, otherwise null. */
  name: string | null
  prev: unknown
  next: unknown
  /** False when the DOM already held `next` and the write was skipped. */
  applied: boolean
}

export interface Inspector {
  storeCreate?(store: StoreInfo): void
  reactionCreate?(reaction: ReactionInfo): void
  reactionDispose?(reaction: ReactionInfo): void
  /** A write changed state. Fired before any notification is queued. */
  commit?(event: CommitEvent): void
  /** A write assigned the value a key already held, so nothing was notified. */
  writeSkipped?(event: { storeId: number; path: string[]; value: unknown }): void
  /** A reaction read a key and now depends on it. */
  track?(event: { reaction: ReactionInfo; storeId: number; path: string[] }): void
  /** A computed was invalidated by one of its dependencies. */
  invalidate?(reaction: ReactionInfo): void
  /** A reaction was queued. `deduped` means it was already waiting in that lane. */
  enqueue?(event: { reaction: ReactionInfo; lane: Lane; deduped: boolean }): void
  flushStart?(event: { lane: Lane; round: number }): void
  flushEnd?(event: { lane: Lane }): void
  batchStart?(): void
  batchEnd?(): void
  runStart?(reaction: ReactionInfo): void
  runEnd?(reaction: ReactionInfo, error: unknown): void
  domWrite?(event: DomWriteEvent): void
}

export let inspector: Inspector | null = null

/**
 * Installs an inspector. Returns a function that removes it again.
 *
 * @example
 * const stop = setInspector({ commit: (e) => console.log(e.path, e.next) })
 */
export function setInspector(next: Inspector | null): () => void {
  const previous = inspector
  inspector = next
  return () => {
    if (inspector === next) inspector = previous
  }
}
