import { Store, createStore } from "./store"
import { Reaction, toRaw } from "./reactivity"
import { inspector, DomChannel } from "./inspector"
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

function splitDirective(expression: string): [path: string, name: string] {
  const colonIdx = expression.lastIndexOf(":")
  return [expression.slice(0, colonIdx).trim(), expression.slice(colonIdx + 1).trim()]
}

function once(fn: Cleanup): Cleanup {
  let done = false
  return () => {
    if (done) return
    done = true
    fn()
  }
}

/** Nodes created by Ion itself (data-for items). applyBindings' observer ignores them. */
const ionCreated = new WeakSet<Node>()

// ─────────────────────────────────────────────────────────────────────────────
// Binding reactions
// Each directive is a reaction that tracks exactly the keys on its path, and
// writes to the DOM only when the value it computed differs from the DOM's.
// ─────────────────────────────────────────────────────────────────────────────

function bindingReaction<T extends State>(
  el: HTMLElement,
  store: Store<T>,
  directive: string,
  expression: string,
  update: (reaction: Reaction) => void
): Cleanup {
  const reaction: Reaction = new Reaction(() => update(reaction), {
    kind: "binding",
    label: `data-${directive}="${expression}"`,
    storeId: store.id,
    directive,
    path: expression,
    element: el,
  })
  reaction.run()
  return () => reaction.stop()
}

function writeDOM(
  reaction: Reaction,
  el: HTMLElement,
  channel: DomChannel,
  name: string | null,
  prev: unknown,
  next: unknown,
  apply: () => void
): void {
  const applied = prev !== next
  if (applied) apply()
  if (inspector) {
    inspector.domWrite?.({ reaction: reaction.info, element: el, channel, name, prev, next, applied })
  }
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

  return bindingReaction(el, store, "bind", expression, (reaction) => {
    const value = resolvePath(expression, store.state)
    const next = value == null ? "" : String(value)
    writeDOM(reaction, el, "text", null, el.textContent, next, () => {
      el.textContent = next
    })
  })
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

  return bindingReaction(el, store, "show", expression, (reaction) => {
    const next = !resolvePath(expression, store.state)
    writeDOM(reaction, el, "hidden", null, el.hidden, next, () => {
      el.hidden = next
    })
  })
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
  const [path, attrName] = splitDirective(expression)

  return bindingReaction(el, store, "attr", expression, (reaction) => {
    const value = resolvePath(path, store.state)
    const next = value == null ? null : String(value)
    writeDOM(reaction, el, "attr", attrName, el.getAttribute(attrName), next, () => {
      if (next === null) el.removeAttribute(attrName)
      else el.setAttribute(attrName, next)
    })
  })
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
  const [path, className] = splitDirective(expression)

  return bindingReaction(el, store, "class", expression, (reaction) => {
    const next = Boolean(resolvePath(path, store.state))
    writeDOM(reaction, el, "class", className, el.classList.contains(className), next, () => {
      el.classList.toggle(className, next)
    })
  })
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
  const field = el as HTMLInputElement
  const isCheckbox =
    el instanceof HTMLInputElement && el.type === "checkbox"

  const writeToStore = () => {
    setPath(path, store.state, isCheckbox ? field.checked : field.value)
  }

  const eventName = el instanceof HTMLSelectElement ? "change" : "input"
  el.addEventListener(eventName, writeToStore)

  const stop = bindingReaction(el, store, "model", path, (reaction) => {
    const value = resolvePath(path, store.state)
    if (isCheckbox) {
      const next = Boolean(value)
      writeDOM(reaction, el, "checked", null, field.checked, next, () => {
        field.checked = next
      })
    } else {
      // Skipping identical writes also keeps the caret where the user left it
      const next = value == null ? "" : String(value)
      writeDOM(reaction, el, "value", null, field.value, next, () => {
        field.value = next
      })
    }
  })

  return () => {
    el.removeEventListener(eventName, writeToStore)
    stop()
  }
}

/**
 * data-for="items"
 * Renders a list of child elements from an array in the store.
 *
 * The element must have exactly one direct child with data-for-item, used as
 * the template. Each item is rendered with its own scoped store holding a
 * shallow copy of the item plus `$index` (or `$value` for primitives).
 *
 * @example
 * <ul data-for="todos">
 *   <li data-for-item>
 *     <span data-bind="text"></span>
 *   </li>
 * </ul>
 *
 * Lists are not keyed: the whole list re-renders when the array, its length or
 * any item property it rendered changes. Writes made through an item's scoped
 * store (e.g. data-model inside the template) do not reach the parent array.
 */
export function bindFor<T extends State>(
  el: HTMLElement,
  store: Store<T>,
  customBindings: Map<string, BindingHandler> = new Map(),
  stores: Record<string, Store<any>> = {}
): Cleanup {
  const expression = el.dataset.for!
  const template = Array.from(el.children).find((child) =>
    child.hasAttribute("data-for-item")
  ) as HTMLElement | undefined

  if (!template) {
    console.warn(
      `[data-for] Element with data-for="${expression}" has no direct child with [data-for-item].`
    )
    return () => {}
  }

  el.removeChild(template)

  let itemCleanups: Cleanup[] = []
  const clearItems = () => {
    itemCleanups.forEach((cleanup) => cleanup())
    itemCleanups = []
  }

  const reaction = new Reaction(
    () => {
      clearItems()
      while (el.firstChild) el.removeChild(el.firstChild)

      const list = resolvePath(expression, store.state)
      if (!Array.isArray(list)) return

      list.forEach((item: unknown, index: number) => {
        const node = template.cloneNode(true) as HTMLElement
        node.removeAttribute("data-for-item")
        ionCreated.add(node)

        // Reading the item's keys here makes the list depend on them
        const scope =
          typeof item === "object" && item !== null
            ? { ...copyItem(item as Record<string, unknown>), $index: index }
            : { $value: item, $index: index }
        const itemStore = createStore(scope, { name: `${expression}[${index}]` })

        itemCleanups.push(bindTree(node, itemStore, customBindings, stores, null))
        el.appendChild(node)
      })
    },
    {
      kind: "binding",
      label: `data-for="${expression}"`,
      storeId: store.id,
      directive: "for",
      path: expression,
      element: el,
    }
  )

  reaction.run()

  return () => {
    reaction.stop()
    clearItems()
  }
}

function copyItem(item: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(item)) copy[key] = toRaw(item[key])
  return copy
}

// ─────────────────────────────────────────────────────────────────────────────
// Core binding application
// ─────────────────────────────────────────────────────────────────────────────

function bindElement<T extends State>(
  el: HTMLElement,
  store: Store<T>,
  customBindings: Map<string, BindingHandler>,
  stores: Record<string, Store<any>>
): Cleanup | null {
  const dataset = el.dataset
  const cleanups: Cleanup[] = []

  if (dataset.bind !== undefined) cleanups.push(bindText(el, store))
  if (dataset.show !== undefined) cleanups.push(bindShow(el, store))
  if (dataset.model !== undefined) cleanups.push(bindModel(el, store))
  if (dataset.attr !== undefined) cleanups.push(bindAttr(el, store))
  if (dataset.class !== undefined) cleanups.push(bindClass(el, store))
  if (dataset.for !== undefined) cleanups.push(bindFor(el, store, customBindings, stores))

  // Custom bindings
  customBindings.forEach((handler, attr) => {
    const dataAttr = attr.startsWith("data-") ? attr : `data-${attr}`
    const key = dataAttr.replace("data-", "")
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    const value = (dataset as any)[camel]
    if (value !== undefined) {
      const cleanup = handler(el, value, stores, store)
      if (cleanup) cleanups.push(cleanup)
    }
  })

  if (cleanups.length === 0) return null
  return once(() => cleanups.forEach((cleanup) => cleanup()))
}

/**
 * Binds `root` and its descendants in document order. A data-for element owns
 * its subtree (the template), so the walk does not descend into it.
 */
function bindTree<T extends State>(
  root: HTMLElement,
  store: Store<T>,
  customBindings: Map<string, BindingHandler>,
  stores: Record<string, Store<any>>,
  registry: Map<Element, Cleanup> | null
): Cleanup {
  const cleanups: Cleanup[] = []

  const visit = (el: HTMLElement) => {
    if (!el.dataset) return
    if (!registry?.has(el)) {
      const cleanup = bindElement(el, store, customBindings, stores)
      if (cleanup) {
        cleanups.push(cleanup)
        registry?.set(el, cleanup)
      }
    }
    if (el.dataset.for !== undefined) return
    for (const child of Array.from(el.children)) visit(child as HTMLElement)
  }

  visit(root)
  return () => cleanups.forEach((cleanup) => cleanup())
}

/**
 * Applies all built-in and custom bindings to a root element and its subtree.
 * Observes the DOM so that elements added later are bound and elements removed
 * later are released. Returns a full cleanup function.
 */
export function applyBindings<T extends State>(
  root: HTMLElement,
  store: Store<T>,
  customBindings: Map<string, BindingHandler> = new Map(),
  stores: Record<string, Store<any>> = {}
): Cleanup {
  const bound = new Map<Element, Cleanup>()

  // Apply to existing DOM
  bindTree(root, store, customBindings, stores, bound)

  const release = (node: Element) => {
    for (const el of [node, ...Array.from(node.querySelectorAll("*"))]) {
      const cleanup = bound.get(el)
      if (cleanup) {
        cleanup()
        bound.delete(el)
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        // Nodes that were only moved inside root keep their bindings
        if (node.nodeType !== Node.ELEMENT_NODE || root.contains(node)) return
        release(node as Element)
      })
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE || ionCreated.has(node)) return
        if (!root.contains(node)) return
        bindTree(node as HTMLElement, store, customBindings, stores, bound)
      })
    })
  })

  observer.observe(root, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    bound.forEach((cleanup) => cleanup())
    bound.clear()
  }
}
