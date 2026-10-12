import { describe, expect, it } from "vitest"
import { createStore, effect } from "../index"
import { settle } from "./helpers"

describe("watch", () => {
  it("fires for nested paths when the leaf changes", async () => {
    const store = createStore({ profile: { address: { city: "POA" } } })
    const cities: unknown[] = []
    store.watch("profile.address.city", (value) => cities.push(value))

    store.state.profile.address.city = "Caxias do Sul"
    await settle()

    expect(cities).toEqual(["Caxias do Sul"])
  })

  it("fires when a parent object on the path is replaced", async () => {
    const store = createStore({ profile: { name: "Ana" } })
    const names: unknown[] = []
    store.watch("profile.name", (value) => names.push(value))

    store.state.profile = { name: "João" }
    await settle()

    expect(names).toEqual(["João"])
  })

  it("does not fire when the value ends up unchanged within a flush", async () => {
    const store = createStore({ count: 1 })
    const values: unknown[] = []
    store.watch("count", (value) => values.push(value))

    store.state.count = 2
    store.state.count = 1
    await settle()

    expect(values).toEqual([])
  })
})

describe("onChange", () => {
  it("reports the leaf key, value and full path of every change", async () => {
    const store = createStore({ profile: { name: "Ana" } })
    const changes: unknown[][] = []
    store.onChange((prop, value, _state, path) => changes.push([prop, value, path]))

    store.state.profile.name = "João"
    await settle()

    expect(changes).toEqual([["name", "João", ["profile", "name"]]])
  })
})

describe("computed", () => {
  it("recomputes only when one of its own dependencies changes", async () => {
    let evaluations = 0
    const store = createStore(
      { price: 10, qty: 2, note: "" },
      {
        computed: {
          total: (s) => {
            evaluations++
            return s.price * s.qty
          },
        },
      }
    )

    expect(store.state.total).toBe(20)
    store.state.note = "unrelated"
    expect(store.state.total).toBe(20)
    expect(evaluations).toBe(1)

    store.state.qty = 3
    expect(store.state.total).toBe(30)
    expect(evaluations).toBe(2)
  })

  it("re-runs effects that read a computed when its dependencies change", async () => {
    const store = createStore(
      { count: 1 },
      { computed: { double: (s) => s.count * 2 } }
    )
    const seen: number[] = []
    effect(() => {
      seen.push(store.state.double)
    })

    store.state.count = 2
    await settle()
    store.state.count = 3
    await settle()

    expect(seen).toEqual([2, 4, 6])
  })

  it("supports computeds that depend on other computeds", async () => {
    const store = createStore(
      { price: 100, discount: 0.1 },
      {
        computed: {
          total: (s) => s.price,
          final: (s) => s.total * (1 - s.discount),
        },
      }
    )
    const seen: number[] = []
    effect(() => {
      seen.push(store.state.final)
    })

    store.state.price = 200
    await settle()

    expect(seen).toEqual([90, 180])
  })
})

describe("subscribe", () => {
  it("fires for any write to the store", async () => {
    const store = createStore({ a: 0, b: 0 })
    let calls = 0
    store.subscribe(() => calls++)

    store.state.b = 1
    await settle()

    expect(calls).toBe(1)
  })
})
