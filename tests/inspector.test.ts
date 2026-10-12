import { afterEach, describe, expect, it } from "vitest"
import { applyBindings, batch, createStore, effect, setInspector } from "../index"
import type { Inspector } from "../index"
import { mount, settle } from "./helpers"

let restore: (() => void) | null = null

afterEach(() => {
  restore?.()
  restore = null
})

/** Records inspector events as short strings, ignoring reads made while binding. */
function record(): { log: string[]; inspector: Inspector } {
  const log: string[] = []
  const inspector: Inspector = {
    commit: (e) => log.push(`commit ${e.path.join(".")} ${String(e.prev)}→${String(e.next)}`),
    writeSkipped: (e) => log.push(`skip ${e.path.join(".")}`),
    invalidate: (r) => log.push(`invalidate ${r.label}`),
    enqueue: (e) => log.push(`enqueue ${e.reaction.label} ${e.lane}${e.deduped ? " deduped" : ""}`),
    flushStart: (e) => log.push(`flush ${e.lane}`),
    batchStart: () => log.push("batch"),
    batchEnd: () => log.push("batch end"),
    runStart: (r) => log.push(`run ${r.label}`),
    domWrite: (e) =>
      log.push(`dom ${e.channel} ${String(e.prev)}→${String(e.next)}${e.applied ? "" : " (skipped)"}`),
  }
  return { log, inspector }
}

function setup() {
  const root = mount(`
    <output data-bind="count"></output>
    <span data-bind="parity"></span>
    <span data-bind="label"></span>
  `)
  const store = createStore(
    { count: 0, label: "A" },
    { computed: { parity: (s) => (s.count % 2 ? "odd" : "even") } }
  )
  applyBindings(root, store)
  return { root, store }
}

describe("inspector", () => {
  it("reports a write from commit to DOM, skipping unaffected bindings", async () => {
    const { store } = setup()
    const { log, inspector } = record()
    restore = setInspector(inspector)

    store.state.count = 1
    await settle()

    expect(log).toEqual([
      "commit count 0→1",
      'enqueue data-bind="count" microtask',
      "invalidate parity",
      'enqueue data-bind="parity" microtask',
      "flush microtask",
      'run data-bind="count"',
      "dom text 0→1",
      'run data-bind="parity"',
      "run parity",
      "dom text even→odd",
    ])
  })

  it("shows deduplication and identical-value skips", async () => {
    const { store } = setup()
    const { log, inspector } = record()
    restore = setInspector(inspector)

    store.state.count = 2
    store.state.count = 2
    store.state.count = 4
    await settle()

    expect(log).toEqual([
      "commit count 0→2",
      'enqueue data-bind="count" microtask',
      "invalidate parity",
      'enqueue data-bind="parity" microtask',
      "skip count",
      "commit count 2→4",
      'enqueue data-bind="count" microtask deduped',
      "flush microtask",
      'run data-bind="count"',
      "dom text 0→4",
      'run data-bind="parity"',
      "run parity",
      "dom text even→even (skipped)",
    ])
  })

  it("reports the batch lane and its synchronous drain", () => {
    const { store } = setup()
    const { log, inspector } = record()
    restore = setInspector(inspector)

    batch(() => {
      store.state.label = "B"
    })

    expect(log).toEqual([
      "batch",
      "commit label A→B",
      'enqueue data-bind="label" batch',
      "batch end",
      "flush batch",
      'run data-bind="label"',
      "dom text A→B",
    ])
  })

  it("reports dependencies as they are tracked, including dynamic ones", async () => {
    const store = createStore({ armed: false, count: 0 })
    const tracked: string[] = []
    restore = setInspector({
      track: (e) => tracked.push(`${e.reaction.label}:${e.path.join(".")}`),
    })

    effect(
      () => {
        if (store.state.armed) void store.state.count
      },
      { label: "alarm" }
    )
    store.state.armed = true
    await settle()

    expect(tracked).toEqual(["alarm:armed", "alarm:armed", "alarm:count"])
  })

  it("describes bindings with their directive, path, store and element", () => {
    const root = mount(`<p data-show="open"></p>`)
    const store = createStore({ open: true }, { name: "panel" })
    const created: unknown[] = []
    const stores: unknown[] = []
    restore = setInspector({
      storeCreate: (s) => stores.push(s),
      reactionCreate: (r) => created.push(r),
    })

    const itemStore = createStore({ x: 1 }, { name: "scratch" })
    applyBindings(root, store)

    expect(stores).toEqual([{ id: itemStore.id, name: "scratch" }])
    expect(created).toEqual([
      expect.objectContaining({
        kind: "binding",
        directive: "show",
        path: "open",
        storeId: store.id,
        element: root.querySelector("p"),
        label: 'data-show="open"',
      }),
    ])
  })

  it("can be removed again", async () => {
    const { store } = setup()
    const { log, inspector } = record()
    const stop = setInspector(inspector)
    stop()

    store.state.count = 5
    await settle()
    expect(log).toEqual([])
  })
})
