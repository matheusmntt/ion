import { describe, expect, it } from "vitest"
import { App, createComponentRegistry, createStore } from "../index"
import { mount, settle } from "./helpers"

describe("component registries", () => {
  it("are isolated from each other", () => {
    const root = mount(`<div data-widget></div>`)
    const a = createComponentRegistry()
    const b = createComponentRegistry()
    const mounted: string[] = []
    a.register("[data-widget]", () => void mounted.push("a"))
    b.register("[data-widget]", () => void mounted.push("b"))

    a.init(root)
    b.init(root)

    expect(mounted).toEqual(["a", "b"])
  })

  it("runs cleanup on destroy", () => {
    const root = mount(`<div data-widget></div>`)
    const registry = createComponentRegistry()
    let cleaned = false
    registry.register("[data-widget]", () => ({ cleanup: () => (cleaned = true) }))
    registry.init(root)

    registry.destroySubtree(root)
    expect(cleaned).toBe(true)
  })
})

describe("plugins", () => {
  it("pass the bound store and the registered stores to custom bindings", () => {
    const root = mount(`<span data-greeting="name"></span>`)
    const store = App.store("plugin-test", { name: "Ana" })
    let received: unknown[] = []
    App.use({
      install(ctx) {
        ctx.registerBinding("data-greeting", (_el, expression, stores, bound) => {
          received = [expression, stores["plugin-test"], bound]
        })
      },
    })

    App.bind(root, store)
    expect(received).toEqual(["name", store, store])
  })
})

describe("README hero example", () => {
  it("increments the bound counter", async () => {
    const root = mount(`
      <div data-counter>
        <button>+</button>
        <span data-bind="count"></span>
      </div>
    `)
    const counter = App.store("counter", { count: 0 })

    App.component("[data-counter]", (el) => {
      App.bind(el, counter)
      el.querySelector("button")!.addEventListener("click", () => {
        counter.state.count++
      })
    })
    App.start()

    expect(root.querySelector("span")!.textContent).toBe("0")
    root.querySelector("button")!.click()
    await settle()
    expect(root.querySelector("span")!.textContent).toBe("1")
  })

  it("keeps standalone stores out of App.stores", () => {
    const local = createStore({ a: 1 })
    expect(Object.values(App.stores)).not.toContain(local)
  })
})
