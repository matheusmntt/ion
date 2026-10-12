import { describe, expect, it } from "vitest"
import { createStore, effect, toRaw } from "../index"
import { settle } from "./helpers"

describe("deep reactivity", () => {
  it("re-runs effects that read an array's length when an item is pushed", async () => {
    const store = createStore({ items: [] as number[] })
    const lengths: number[] = []
    effect(() => {
      lengths.push(store.state.items.length)
    })

    store.state.items.push(1)
    await settle()
    store.state.items.push(2)
    await settle()

    expect(lengths).toEqual([0, 1, 2])
  })

  it("re-runs effects that iterate an object when a key is added or deleted", async () => {
    const store = createStore({ map: {} as Record<string, number> })
    const keys: string[][] = []
    effect(() => {
      keys.push(Object.keys(store.state.map))
    })

    store.state.map.a = 1
    await settle()
    delete store.state.map.a
    await settle()

    expect(keys).toEqual([[], ["a"], []])
  })

  it("re-runs effects that use `in` when the key appears", async () => {
    const store = createStore({ flags: {} as Record<string, boolean> })
    const results: boolean[] = []
    effect(() => {
      results.push("on" in store.state.flags)
    })

    store.state.flags.on = true
    await settle()

    expect(results).toEqual([false, true])
  })

  it("triggers effects when a tracked property is deleted", async () => {
    const store = createStore({ user: { name: "Ana" } as { name?: string } })
    const names: Array<string | undefined> = []
    effect(() => {
      names.push(store.state.user.name)
    })

    delete store.state.user.name
    await settle()

    expect(names).toEqual(["Ana", undefined])
  })

  it("leaves built-in objects such as Date and Map unproxied", () => {
    const when = new Date(0)
    const lookup = new Map([["a", 1]])
    const store = createStore({ when, lookup })

    expect(store.state.when.getTime()).toBe(0)
    expect(store.state.lookup.get("a")).toBe(1)
    expect(store.state.when).toBe(when)
  })

  it("gives each store its own proxy for a shared raw object", async () => {
    const shared = { count: 0 }
    const a = createStore({ shared })
    const b = createStore({ shared })
    let notifiedB = 0
    b.subscribe(() => notifiedB++)

    // Store A wraps the shared object first; B must still get its own proxy.
    void a.state.shared.count
    b.state.shared.count = 1
    await settle()

    expect(notifiedB).toBe(1)
    expect(toRaw(a.state.shared)).toBe(toRaw(b.state.shared))
  })

  it("keeps reference equality for nested proxies", () => {
    const store = createStore({ profile: { name: "Ana" } })
    expect(store.state.profile).toBe(store.state.profile)
  })
})
