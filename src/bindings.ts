import { Store, createStore } from "./store"
import { State, Cleanup, BindingHandler } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function resolvePath(path: string, obj: any): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj)
}

function setPath(path: string, obj: any, value: unknown): void {
  const parts = path.split(".")
  const last = parts.pop()!
  const target = parts.reduce((acc, key) => acc?.[key], obj)
  if (target != null) target[last] = value
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in bindings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * data-bind="path"
 * One-way binding: sets element.textContent to the resolved path value.
 */
export function bindText<T extends State>(
  el: HTMLElement,
  store: Store<T>
): Cleanup {
  const expression = el.dataset.bind!

  const update = () => {
    const value = resolvePath(expression, store.state)
    el.textContent = value ?? ""
  }

  update()
  return store.subscribe(update)
}

/**
 * data-show="path"
 * Toggles el.hidden based on the truthiness of the resolved value.
 */
export function bindShow<T extends State>(
  el: HTMLElement,
  store: Store<T>
): Cleanup {
  const expression = el.dataset.show!

  const update = () => {
    const result = resolvePath(expression, store.state)
    el.hidden = !result
  }

  update()
  return store.subscribe(update)
}

/**
 * data-attr="prop:attrName"
 * Binds a state value to an element attribute.
 *
 * @example <img data-attr="user.avatar:src">
 */
export function bindAttr<T extends State>(
  el: HTMLElement,
  store: Store<T>
): Cleanup {
  const expression = el.dataset.attr!
  const colonIdx = expression.lastIndexOf(":")
  const path = expression.slice(0, colonIdx).trim()
  const attrName = expression.slice(colonIdx + 1).trim()

  const update = () => {
    const value = resolvePath(path, store.state)
    if (value == null) {
      el.removeAttribute(attrName)
    } else {
      el.setAttribute(attrName, String(value))
    }
  }

  update()
  return store.subscribe(update)
}

/**
 * data-class="path:className"
 * Toggles a CSS class based on the truthiness of the resolved value.
 *
 * @example <div data-class="isActive:active">
 */
export function bindClass<T extends State>(
  el: HTMLElement,
  store: Store<T>
): Cleanup {
  const expression = el.dataset.class!
  const colonIdx = expression.lastIndexOf(":")
  const path = expression.slice(0, colonIdx).trim()
  const className = expression.slice(colonIdx + 1).trim()

  const update = () => {
    const value = resolvePath(path, store.state)
    el.classList.toggle(className, Boolean(value))
  }

  update()
  return store.subscribe(update)
}

/**
 * data-model="path"
 * Two-way binding for input, textarea, and select elements.
 * Reads from the store into the element value and writes back on input/change.
 *
 * For checkboxes: binds to .checked.
 * For all others: binds to .value.
 *
 * @example <input data-model="user.name">
 */
export function bindModel<T extends State>(
  el: HTMLElement,
  store: Store<T>
): Cleanup {
  const path = el.dataset.model!
  const isCheckbox =
    el instanceof HTMLInputElement && el.type === "checkbox"

  const writeToDOM = () => {
    const value = resolvePath(path, store.state)
    if (isCheckbox) {
      ;(el as HTMLInputElement).checked = Boolean(value)
    } else {
      ;(el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value =
        value ?? ""
    }
  }

  const writeToStore = () => {
    const value = isCheckbox
      ? (el as HTMLInputElement).checked
      : (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value

    setPath(path, store.state, value)
  }

  const eventName = el instanceof HTMLSelectElement ? "change" : "input"
  el.addEventListener(eventName, writeToStore)

  writeToDOM()
  const unsub = store.subscribe(writeToDOM)

  return () => {
    el.removeEventListener(eventName, writeToStore)
    unsub()
  }
}

/**
 * data-for="items"
 * Renders a list of child elements from an array in the store.
 *
 * The element must contain exactly one child template element.
 * Each array item is exposed to bindings inside the template via a child store.
 *
 * The template element should have data-for-item on it.
 *
 * @example
 * <ul data-for="todos">
 *   <li data-for-item>
 *     <span data-bind="text"></span>
 *   </li>
 * </ul>
 *
 * Note: for complex lists prefer a component-based approach.
 * This binding is intentionally simple — it re-renders the full list on change.
 */
export function bindFor<T extends State>(
  el: HTMLElement,
  store: Store<T>,
  customBindings: Map<string, BindingHandler>
): Cleanup {
  const expression = el.dataset.for!
  const template = el.querySelector<HTMLElement>("[data-for-item]")

  if (!template) {
    console.warn(
      `[data-for] Element with data-for="${expression}" has no child with [data-for-item].`
    )
    return () => {}
  }

  el.removeChild(template)

  let itemCleanups: Cleanup[] = []

  const render = () => {
    // Clean up previous rendered items
    itemCleanups.forEach((c) => c())
    itemCleanups = []

    // Clear rendered children (keep nothing that isn't the template)
    while (el.firstChild) el.removeChild(el.firstChild)

    const list = resolvePath(expression, store.state)
    if (!Array.isArray(list)) return

    list.forEach((item: any, index: number) => {
      const node = template.cloneNode(true) as HTMLElement
      node.removeAttribute("data-for-item")

      // Create a scoped store for this item
      const itemStore = createStore(
        typeof item === "object" && item !== null
          ? { ...item, $index: index }
          : { $value: item, $index: index }
      )

      // Apply bindings to the cloned node
      const cleanup = applyBindingsToNode(node, itemStore, customBindings)
      itemCleanups.push(cleanup)

      el.appendChild(node)
    })
  }

  render()
  const unsub = store.subscribe(render)

  return () => {
    unsub()
    itemCleanups.forEach((c) => c())
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core binding application
// ─────────────────────────────────────────────────────────────────────────────

function applyBindingsToNode<T extends State>(
  root: HTMLElement,
  store: Store<T>,
  customBindings: Map<string, BindingHandler>
): Cleanup {
  const unsubs: Cleanup[] = []

  // Process built-ins
  const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]

  for (const el of candidates) {
    if (el.dataset.bind !== undefined) unsubs.push(bindText(el, store))
    if (el.dataset.show !== undefined) unsubs.push(bindShow(el, store))
    if (el.dataset.model !== undefined) unsubs.push(bindModel(el, store))
    if (el.dataset.attr !== undefined) unsubs.push(bindAttr(el, store))
    if (el.dataset.class !== undefined) unsubs.push(bindClass(el, store))
    if (el.dataset.for !== undefined) {
      unsubs.push(bindFor(el, store, customBindings))
    }

    // Custom bindings
    customBindings.forEach((handler, attr) => {
      const dataAttr = attr.startsWith("data-") ? attr : `data-${attr}`
      const key = dataAttr.replace("data-", "")
      const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      const value = (el.dataset as any)[camel]
      if (value !== undefined) {
        const cleanup = handler(el, value, {})
        if (cleanup) unsubs.push(cleanup)
      }
    })
  }

  return () => unsubs.forEach((u) => u())
}

/**
 * Applies all built-in and custom bindings to a root element and its subtree.
 * Observes the DOM for dynamically added elements via MutationObserver.
 * Returns a full cleanup function.
 */
export function applyBindings<T extends State>(
  root: HTMLElement,
  store: Store<T>,
  customBindings: Map<string, BindingHandler> = new Map()
): Cleanup {
  const unsubs: Cleanup[] = []

  // Apply to existing DOM
  unsubs.push(applyBindingsToNode(root, store, customBindings))

  // Watch for dynamically added nodes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        unsubs.push(applyBindingsToNode(node, store, customBindings))
      })
    })
  })

  observer.observe(root, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    unsubs.forEach((u) => u())
  }
}
