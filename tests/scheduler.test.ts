import { afterEach, describe, expect, it, vi } from "vitest"
import { batch, createStore, effect } from "../index"
import { settle } from "./helpers"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("scheduler", () => {
  it("runs each subscriber once per flush, however many writes happened", async () => {
    const store = createStore({ a: 0, b: 0 })
    const seen: number[] = []
    store.subscribe((s) => seen.push(s.a + s.b))

    store.state.a = 1
    store.state.b = 2
    store.state.a = 3

    expect(seen).toEqual([])
    await settle()
    expect(seen).toEqual([5])
  })

  it("re-runs an effect once per flush even when several of its dependencies change", async () => {
    const store = createStore({ a: 0, b: 0 })
    let runs = 0
    effect(() => {
      runs++
      void store.state.a
      void store.state.b
    })

    store.state.a = 1
    store.state.b = 1
    store.state.a = 2
    await settle()

    expect(runs).toBe(2)
  })

  it("drains batch() synchronously when the outermost batch ends, deduped", () => {
    const store = createStore({ a: 0 })
    const seen: number[] = []
    store.subscribe((s) => seen.push(s.a))

    batch(() => {
      store.state.a = 1
      batch(() => {
        store.state.a = 2
      })
      store.state.a = 3
      expect(seen).toEqual([])
    })

    expect(seen).toEqual([3])
  })

  it("keeps flushing the remaining jobs when one of them throws", async () => {
    const reported: unknown[] = []
    vi.stubGlobal("reportError", (error: unknown) => reported.push(error))

    const store = createStore({ a: 0 })
    const calls: string[] = []
    store.subscribe(() => {
      calls.push("first")
      throw new Error("boom")
    })
    store.subscribe(() => calls.push("second"))

    store.state.a = 1
    await settle()

    expect(calls).toEqual(["first", "second"])
    expect(reported).toHaveLength(1)
    expect((reported[0] as Error).message).toBe("boom")
  })

  it("detects reactive loops between effects instead of hanging", async () => {
    const reported: unknown[] = []
    vi.stubGlobal("reportError", (error: unknown) => reported.push(error))

    const store = createStore({ x: 0, y: 0 })
    effect(() => {
      store.state.y = store.state.x + 1
    })
    effect(() => {
      store.state.x = store.state.y + 1
    })

    await settle()

    expect(reported).toHaveLength(1)
    expect(String((reported[0] as Error).message)).toMatch(/loop/i)
  })

  it("does not re-run an effect that writes a key it also reads", async () => {
    const store = createStore({ count: 0 })
    let runs = 0
    effect(() => {
      runs++
      store.state.count = store.state.count + 1
    })

    await settle()
    expect(runs).toBe(1)
    expect(store.state.count).toBe(1)
  })

  it("cancels an already queued run when an effect is stopped", async () => {
    const store = createStore({ a: 0 })
    let runs = 0
    const stop = effect(() => {
      runs++
      void store.state.a
    })

    store.state.a = 1
    stop()
    await settle()

    expect(runs).toBe(1)
  })
})
