import { describe, expect, it } from "vitest"
import { applyBindings, createStore } from "../index"
import { mount, settle } from "./helpers"

/** Counts assignments to a property on one element without changing behaviour. */
function countWrites(el: Element, prop: "textContent" | "value" | "hidden" | "checked") {
  let proto: object | null = el
  let descriptor: PropertyDescriptor | undefined
  while (proto && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(proto, prop)
    proto = Object.getPrototypeOf(proto)
  }
  const counter = { writes: 0 }
  Object.defineProperty(el, prop, {
    configurable: true,
    get() {
      return descriptor!.get!.call(this)
    },
    set(value) {
      counter.writes++
      descriptor!.set!.call(this, value)
    },
  })
  return counter
}

describe("fine-grained bindings", () => {
  it("only re-runs the bindings whose path changed", async () => {
    const root = mount(`
      <span id="count" data-bind="count"></span>
      <span id="label" data-bind="label"></span>
    `)
    const label = root.querySelector("#label")!
    const store = createStore({ count: 0, label: "A" })
    applyBindings(root, store)
    const labelWrites = countWrites(label, "textContent")

    store.state.count = 1
    await settle()

    expect(root.querySelector("#count")!.textContent).toBe("1")
    expect(labelWrites.writes).toBe(0)
  })

  it("skips DOM writes when the value is identical", async () => {
    const root = mount(`<span data-bind="parity"></span>`)
    const span = root.querySelector("span")!
    const store = createStore(
      { count: 1 },
      { computed: { parity: (s) => (s.count % 2 ? "odd" : "even") } }
    )
    applyBindings(root, store)
    const writes = countWrites(span, "textContent")

    store.state.count = 3
    await settle()

    expect(span.textContent).toBe("odd")
    expect(writes.writes).toBe(0)
  })

  it("tracks nested paths", async () => {
    const root = mount(`<span data-bind="user.name"></span>`)
    const store = createStore({ user: { name: "Ana" } })
    applyBindings(root, store)

    store.state.user.name = "João"
    await settle()
    expect(root.textContent!.trim()).toBe("João")

    store.state.user = { name: "Bia" }
    await settle()
    expect(root.textContent!.trim()).toBe("Bia")
  })

  it("supports show, attr and class directives", async () => {
    const root = mount(`
      <p data-show="open"></p>
      <a data-attr="href:href"></a>
      <div data-class="active:is-active"></div>
    `)
    const store = createStore({ open: false, href: null as string | null, active: false })
    applyBindings(root, store)

    expect(root.querySelector("p")!.hidden).toBe(true)
    expect(root.querySelector("a")!.hasAttribute("href")).toBe(false)

    store.state.open = true
    store.state.href = "/docs"
    store.state.active = true
    await settle()

    expect(root.querySelector("p")!.hidden).toBe(false)
    expect(root.querySelector("a")!.getAttribute("href")).toBe("/docs")
    expect(root.querySelector("div")!.classList.contains("is-active")).toBe(true)
  })
})

describe("data-model", () => {
  it("writes input back to the store and does not rewrite the same value", async () => {
    const root = mount(`<input data-model="name"><span data-bind="name"></span>`)
    const input = root.querySelector("input")!
    const store = createStore({ name: "Ana" })
    applyBindings(root, store)
    expect(input.value).toBe("Ana")

    const writes = countWrites(input, "value")
    input.value = "Ana Lima"
    writes.writes = 0
    input.dispatchEvent(new Event("input"))
    await settle()

    expect(store.state.name).toBe("Ana Lima")
    expect(root.querySelector("span")!.textContent).toBe("Ana Lima")
    expect(writes.writes).toBe(0)
  })

  it("binds checkboxes to booleans", async () => {
    const root = mount(`<input type="checkbox" data-model="done">`)
    const box = root.querySelector("input")!
    const store = createStore({ done: false })
    applyBindings(root, store)

    box.checked = true
    box.dispatchEvent(new Event("input"))
    expect(store.state.done).toBe(true)

    store.state.done = false
    await settle()
    expect(box.checked).toBe(false)
  })
})

describe("data-for", () => {
  const listHtml = `
    <ul data-for="todos">
      <li data-for-item><span data-bind="text"></span><em data-show="done">✓</em></li>
    </ul>
    <p data-bind="title"></p>
  `

  it("renders items with their own scope, across repeated re-renders", async () => {
    const root = mount(listHtml)
    const store = createStore({
      title: "Tasks",
      todos: [{ text: "Write docs", done: false }],
    })
    applyBindings(root, store)

    for (let i = 0; i < 3; i++) {
      store.state.todos = [...store.state.todos, { text: `Item ${i}`, done: i === 1 }]
      await settle()
    }

    const items = Array.from(root.querySelectorAll("li"))
    expect(items.map((li) => li.querySelector("span")!.textContent)).toEqual([
      "Write docs",
      "Item 0",
      "Item 1",
      "Item 2",
    ])
    expect(items.map((li) => li.querySelector("em")!.hidden)).toEqual([true, true, false, true])
  })

  it("re-renders when an item property changes, and not for unrelated keys", async () => {
    const root = mount(listHtml)
    const ul = root.querySelector("ul")!
    const store = createStore({ title: "Tasks", todos: [{ text: "A", done: false }] })
    applyBindings(root, store)
    const first = ul.firstElementChild

    store.state.title = "Renamed"
    await settle()
    expect(ul.firstElementChild).toBe(first)

    store.state.todos[0].done = true
    await settle()
    expect(ul.querySelector("em")!.hidden).toBe(false)
  })

  it("does not bind the template's children to the parent store", async () => {
    const root = mount(listHtml)
    const store = createStore({ title: "Tasks", todos: [] as Array<{ text: string; done: boolean }> })
    applyBindings(root, store)
    let calls = 0
    store.subscribe(() => calls++)

    store.state.todos = [{ text: "A", done: false }]
    await settle()
    await settle()

    expect(root.querySelector("span")!.textContent).toBe("A")
    expect(calls).toBe(1)
  })
})

describe("applyBindings observer", () => {
  it("binds elements added after the initial scan", async () => {
    const root = mount(`<div id="slot"></div>`)
    const store = createStore({ name: "Ana" })
    applyBindings(root, store)

    const span = document.createElement("span")
    span.dataset.bind = "name"
    root.querySelector("#slot")!.appendChild(span)
    await settle()

    expect(span.textContent).toBe("Ana")
  })

  it("stops the bindings of removed elements", async () => {
    const root = mount(`<span data-bind="name"></span>`)
    const span = root.querySelector("span")!
    const store = createStore({ name: "Ana" })
    applyBindings(root, store)

    span.remove()
    await settle()
    const writes = countWrites(span, "textContent")
    store.state.name = "João"
    await settle()

    expect(writes.writes).toBe(0)
  })

  it("disconnects everything on cleanup", async () => {
    const root = mount(`<span data-bind="name"></span>`)
    const store = createStore({ name: "Ana" })
    const cleanup = applyBindings(root, store)

    cleanup()
    store.state.name = "João"
    await settle()

    expect(root.querySelector("span")!.textContent).toBe("Ana")
  })
})
