<div align="center">

<br />

```
  ██╗ ██████╗ ███╗   ██╗
  ██║██╔═══██╗████╗  ██║
  ██║██║   ██║██╔██╗ ██║
  ██║██║   ██║██║╚██╗██║
  ██║╚██████╔╝██║ ╚████║
  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
```

**A tiny reactive micro-framework for server-rendered applications.**
</div>

Ion adds reactive state to any HTML page — no virtual DOM, no build step required, no framework takeover. Drop it into a PHP, Laravel, or any server-rendered application and get fine-grained reactivity exactly where you need it.

```html
<!-- Your server-rendered HTML stays untouched -->
<div data-counter>
  <button>+</button>
  <span data-bind="count"></span>
</div>

<script src="dist/ion.global.js"></script>
<script>
  const counter = Ion.App.store('counter', { count: 0 })

  Ion.App.component('[data-counter]', (el) => {
    el.querySelector('button').addEventListener('click', () => {
      counter.state.count++
    })
  })

  Ion.App.start()
</script>
```

---

## Table of Contents

- [Why Ion?](#why-ion)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Stores](#stores)
  - [Creating a Store](#creating-a-store)
  - [Reading State](#reading-state)
  - [Mutating State](#mutating-state)
  - [Subscribing to Changes](#subscribing-to-changes)
  - [onChange — Full Change Details](#onchange--full-change-details)
  - [Watching a Specific Path](#watching-a-specific-path)
  - [Computed Properties](#computed-properties)
- [DOM Bindings](#dom-bindings)
  - [data-bind — Text](#data-bind--text)
  - [data-show — Visibility](#data-show--visibility)
  - [data-model — Two-Way Input](#data-model--two-way-input)
  - [data-attr — Attribute](#data-attr--attribute)
  - [data-class — Class Toggle](#data-class--class-toggle)
  - [data-for — List Rendering](#data-for--list-rendering)
  - [applyBindings — Manual Binding](#applybindings--manual-binding)
- [Components](#components)
  - [Registering a Component](#registering-a-component)
  - [Component Lifecycle](#component-lifecycle)
  - [Initializing the App](#initializing-the-app)
  - [Dynamic Mount](#dynamic-mount)
  - [Destroying Components](#destroying-components)
- [Reactivity Primitives](#reactivity-primitives)
  - [effect](#effect)
  - [batch](#batch)
- [Plugin System](#plugin-system)
- [TypeScript](#typescript)
- [Using Without a Bundler](#using-without-a-bundler)
- [Architecture](#architecture)
- [API Reference](#api-reference)

---

## Why Ion?

Modern frameworks solve complex problems — but most server-rendered apps don't have complex problems. They need a dropdown that opens, a counter that increments, a form that validates in real time.

Ion is the answer to: _"I just need some reactivity on this PHP page."_

| | Ion | Alpine.js | Vue | React |
|---|---|---|---|---|
| Bundle (min+gz) | ~3 KB | ~15 KB | ~34 KB | ~45 KB |
| Virtual DOM | No | No | Yes | Yes |
| Build step required | No | No | Optional | Yes |
| Server-rendered friendly | ✓ | ✓ | Partial | Partial |
| TypeScript-first | ✓ | Partial | ✓ | ✓ |
| Framework takeover | No | No | Yes | Yes |

Ion focuses on three things: **reactive state**, **declarative bindings**, and **clean component lifecycle**. Nothing more.

---

## Installation

**npm / yarn / pnpm:**

```bash
npm install @matheusmntt/ion
```

**CDN (no build step):**

```html
<!-- IIFE — exposes window.Ion -->
<script src="https://unpkg.com/@matheusmntt/ion/dist/ion.global.js"></script>

<!-- ESM -->
<script type="module">
  import { App } from 'https://unpkg.com/@matheusmntt/ion/dist/ion.js'
</script>
```

**Local build:**

```bash
git clone https://github.com/matheusmntt/ion
cd ion
npm install
npm run build
# → dist/ion.global.js  (IIFE, for <script src>)
# → dist/ion.js         (ESM, for <script type="module">)
# → dist/ion.cjs        (CJS, for require())
```

---

## Core Concepts

Ion is built on three primitives. Understanding them is all you need.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Store ──► holds reactive state                           │
│     │                                                       │
│     └──► Bindings ──► sync state to DOM automatically      │
│     │                                                       │
│     └──► Components ──► attach behavior to elements        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Stores are the single source of truth. Bindings and components read from them, and mutations propagate automatically.

---

## Stores

### Creating a Store

A store wraps a plain JavaScript object in a reactive proxy. Any mutation to `store.state` triggers downstream updates.

```js
// Named store — registered on App, accessible via App.stores
const counter = App.store('counter', {
  count: 0
})

// Standalone store — not registered on App
import { createStore } from '@matheusmntt/ion'

const localStore = createStore({ count: 0 })
```

The first argument of `App.store` is a name. That name lets you retrieve the store later from anywhere:

```js
const counter = App.getStore('counter')
```

---

### Reading State

Read properties directly from `store.state`:

```js
console.log(counter.state.count) // 0
```

Nested objects are fully reactive:

```js
const store = App.store('user', {
  profile: {
    name: 'Ana',
    address: {
      city: 'São Paulo'
    }
  }
})

console.log(store.state.profile.name)         // 'Ana'
console.log(store.state.profile.address.city) // 'São Paulo'
```

> **Note:** The same nested object always returns the same proxy reference. `store.state.profile === store.state.profile` is always `true`.

---

### Mutating State

Assign directly to any property at any depth:

```js
counter.state.count = 5
counter.state.count++

store.state.profile.name = 'João'
store.state.profile.address.city = 'Curitiba'
```

There is no `setState`, no `commit`, no `dispatch`. Ion uses Proxy internally to intercept mutations and schedule notifications automatically.

---

### Subscribing to Changes

`subscribe` fires whenever **any** property in the store changes. The callback receives the updated state.

```js
const unsubscribe = counter.subscribe((state) => {
  console.log('state changed:', state.count)
})

counter.state.count++ // → "state changed: 1"

// Stop listening
unsubscribe()
```

Subscriptions are deduped and batched in microtasks — multiple synchronous mutations in a row produce a single notification per subscriber.

---

### onChange — Full Change Details

When you need to know _which_ property changed and its new value, use `onChange`:

```js
const unlisten = store.onChange((prop, value, state) => {
  console.log(`"${String(prop)}" → ${value}`)
})

store.state.profile.name = 'João'
// → "name" → João

unlisten()
```

Both `subscribe` and `onChange` return a cleanup function. Always call it when you no longer need the subscription to prevent memory leaks.

---

### Watching a Specific Path

`watch` lets you target a specific property — or a **nested path** using dot notation. The callback only fires when that path's value actually changes.

```js
// Top-level property
counter.watch('count', (value, state) => {
  console.log('count is now', value)
})

// Nested path — works correctly, unlike naive implementations
store.watch('profile.name', (value) => {
  document.title = value
})

store.watch('profile.address.city', (value) => {
  console.log('city changed to', value)
})

store.state.profile.name = 'João'         // fires 'profile.name' watcher
store.state.profile.address.city = 'RJ'  // fires 'profile.address.city' watcher
store.state.profile.name = 'João'         // does NOT fire — value is the same
```

`watch` uses value diffing: the callback only runs if the resolved value actually changed, preventing spurious updates.

```js
// All watch calls return an unwatch function
const unwatch = counter.watch('count', callback)
unwatch()
```

---

### Computed Properties

Computed properties are derived values that are **automatically cached** and only recalculated when their dependencies change.

```js
const store = App.store(
  'cart',
  {
    items: [
      { name: 'Coffee', price: 12.9 },
      { name: 'Book',   price: 49.0 },
    ],
    discount: 0.1,
  },
  {
    computed: {
      // Simple function form
      total(state) {
        return state.items.reduce((sum, item) => sum + item.price, 0)
      },

      // With discount applied
      finalPrice(state) {
        return state.total * (1 - state.discount)
      },
    },
  }
)

console.log(store.state.total)      // 61.9
console.log(store.state.finalPrice) // 55.71

// Accessing .total again → returns cached value (no recalculation)
console.log(store.state.total) // 61.9 (from cache)
```

Computed values are **lazy** (calculated on first read) and **dirty-tracked** (invalidated when a dependency changes). They behave like regular state properties for bindings:

```html
<span data-bind="total"></span>
<span data-bind="finalPrice"></span>
```

---

## DOM Bindings

Bindings are HTML attributes that connect the DOM to a store. They update automatically whenever the state changes.

---

### data-bind — Text

Sets the `textContent` of an element to the value at a given path.

```html
<span data-bind="count"></span>
<span data-bind="user.name"></span>
<span data-bind="cart.finalPrice"></span>
```

```js
const store = App.store('ui', {
  count: 0,
  user: { name: 'Ana' },
})

App.bind(document.body, store)

store.state.user.name = 'João'
// → <span>João</span>
```

---

### data-show — Visibility

Toggles `element.hidden` based on the truthiness of the value at the given path.

```html
<div data-show="isLoggedIn">
  Welcome back!
</div>

<div data-show="cart.hasItems">
  Your cart has items.
</div>
```

When the value is falsy, the element is hidden via the native `hidden` attribute. When truthy, `hidden` is removed.

---

### data-model — Two-Way Input

Binds an `<input>`, `<textarea>`, or `<select>` value to the store. Reads from the store and writes back on user input.

```html
<input type="text"     data-model="search.query">
<input type="checkbox" data-model="settings.darkMode">
<textarea              data-model="form.message"></textarea>
<select                data-model="form.country">
  <option value="br">Brazil</option>
  <option value="us">United States</option>
</select>
```

```js
const store = App.store('form', {
  search: { query: '' },
  settings: { darkMode: false },
  form: { message: '', country: 'br' },
})

App.bind(document.body, store)

// User types "Ion" → store.state.search.query === 'Ion'
// store.state.settings.darkMode = true → checkbox becomes checked
```

For checkboxes, Ion binds to `.checked`. For all other inputs, it binds to `.value`.

---

### data-attr — Attribute Binding

Binds a state value to an HTML attribute. Syntax: `"path:attributeName"`.

```html
<img data-attr="user.avatar:src">
<a  data-attr="nav.href:href">Dashboard</a>
<div data-attr="ui.role:aria-label"></div>
```

If the value is `null` or `undefined`, the attribute is **removed** from the element. Otherwise, it is set to `String(value)`.

---

### data-class — Class Toggle

Conditionally toggles a CSS class. Syntax: `"path:className"`.

```html
<button data-class="ui.isLoading:loading">Submit</button>
<div    data-class="form.isValid:valid">...</div>
<li     data-class="item.isActive:active">...</li>
```

```js
store.state.ui.isLoading = true
// → <button class="loading">Submit</button>

store.state.ui.isLoading = false
// → <button>Submit</button>
```

---

### data-for — List Rendering

Renders a list of elements from an array in the store. The parent element acts as the container; one child with `data-for-item` acts as the template.

```html
<ul data-for="todos">
  <li data-for-item>
    <span data-bind="text"></span>
    <em data-show="done">✓</em>
  </li>
</ul>
```

```js
const store = App.store('tasks', {
  todos: [
    { text: 'Buy groceries', done: true  },
    { text: 'Write docs',    done: false },
  ],
})

App.bind(document.body, store)
```

Each item in the array is exposed as a scoped store inside the template. The available properties are the item's own properties plus `$index`.

| Variable | Value |
|---|---|
| `text` | The item's `text` property |
| `done` | The item's `done` property |
| `$index` | The item's position in the array (0-based) |

When `store.state.todos` is reassigned, the list re-renders automatically.

> **Note:** `data-for` performs a full re-render on every change. For high-frequency updates on large lists, a component-based approach is preferred.

---

### applyBindings — Manual Binding

You can connect a store to any DOM subtree manually, bypassing the `App` singleton.

```js
import { applyBindings, createStore } from '@matheusmntt/ion'

const store = createStore({ name: 'Ana', visible: true })

// Apply to a specific root — not necessarily document.body
const cleanup = applyBindings(
  document.querySelector('#my-widget'),
  store
)

// Later, disconnect everything
cleanup()
```

`applyBindings` scans the root element and all its descendants for binding attributes, connects them, and sets up a `MutationObserver` to handle elements added to the DOM _after_ the initial scan.

---

## Components

Components attach JavaScript behavior to DOM elements. They are defined by a CSS selector and a factory function.

### Registering a Component

```js
App.component('[data-counter]', (el) => {
  const store = App.getStore('counter')
  const button = el.querySelector('button')

  const increment = () => store.state.count++
  button.addEventListener('click', increment)

  // Return a cleanup object to free resources when destroyed
  return {
    cleanup() {
      button.removeEventListener('click', increment)
    },
  }
})
```

The factory receives the matched `HTMLElement` and runs once per element. It can optionally return `{ cleanup }`.

`App.component()` is chainable:

```js
App
  .component('[data-counter]', counterFactory)
  .component('[data-modal]',   modalFactory)
  .component('[data-tabs]',    tabsFactory)
```

---

### Component Lifecycle

```
App.start() / App.mount(el)
        │
        ▼
   factory(el) called
        │
        ▼
   instance stored internally (WeakMap — no DOM pollution)
        │
        ▼
   App.destroy(el) called
        │
        ▼
   instance.cleanup() called
        │
        ▼
   instance removed from registry
```

Ion stores component instances in a `WeakMap` keyed by element. This means:

- No `el.__cleanup` properties attached to DOM nodes
- No conflicts with third-party libraries
- Garbage collector automatically cleans up when elements are removed

---

### Initializing the App

After registering all stores and components, call `App.start()` once:

```js
const counter = App.store('counter', { count: 0 })
const user    = App.store('user',    { name: 'Ana' })

App.component('[data-counter]', counterFactory)
App.component('[data-user]',    userFactory)

// Scans the entire document and mounts all registered components
App.start()
```

---

### Dynamic Mount

For content injected into the DOM after `App.start()` (e.g., HTMX responses, modal content):

```js
// Insert dynamic content
const section = document.createElement('section')
section.innerHTML = serverResponse
document.body.appendChild(section)

// Mount only the new subtree — already-mounted components are unaffected
App.mount(section)
```

---

### Destroying Components

```js
// Destroy a single component
App.destroy(document.querySelector('[data-counter]'))

// Destroy all components in a subtree (useful when removing DOM sections)
App.destroySubtree(document.querySelector('#modal'))
```

`destroySubtree` walks the entire subtree and calls `cleanup()` on every mounted component it finds.

---

## Reactivity Primitives

Ion exposes two low-level primitives for advanced use cases.

### effect

`effect` runs a callback immediately and re-runs it automatically whenever any reactive state it reads changes. Dependencies are **tracked automatically** — you do not declare them.

```js
const store = App.store('page', { title: 'Home', visits: 0 })

const stop = App.effect(() => {
  // This reads store.state.title — it becomes a dependency automatically
  document.title = store.state.title
})

store.state.title = 'About'
// → document.title === 'About' (effect re-ran)

store.state.visits++
// → effect does NOT re-run (visits was never read inside the effect)

// Permanently disable the effect
stop()
```

The callback may return a cleanup function, which Ion calls before each re-run and on final stop:

```js
App.effect(() => {
  const handler = () => console.log(store.state.count)
  window.addEventListener('focus', handler)

  return () => {
    window.removeEventListener('focus', handler)
  }
})
```

---

### batch

`batch` groups multiple state mutations into a single notification cycle. Useful when updating several properties that should appear as a single atomic change.

```js
const store = App.store('form', {
  firstName: '',
  lastName: '',
  email: '',
})

// Without batch: 3 separate notification cycles → 3 DOM updates
store.state.firstName = 'Ana'
store.state.lastName  = 'Lima'
store.state.email     = 'ana@example.com'

// With batch: 1 notification cycle → 1 DOM update
App.batch(() => {
  store.state.firstName = 'Ana'
  store.state.lastName  = 'Lima'
  store.state.email     = 'ana@example.com'
})
```

`batch` calls are **nestable**. Notifications flush only when the outermost `batch` completes.

```js
App.batch(() => {
  store.state.a = 1
  App.batch(() => {
    store.state.b = 2  // still inside outer batch
  })
  store.state.c = 3
})
// → single flush here
```

---

## Plugin System

Ion's plugin API allows registering custom binding directives.

```js
const TooltipPlugin = {
  install(ctx) {
    ctx.registerBinding('data-tooltip', (el, expression) => {
      el.setAttribute('title', expression)
      el.setAttribute('aria-label', expression)
    })
  },
}

App.use(TooltipPlugin)
```

After installing, `data-tooltip` works anywhere in your HTML:

```html
<button data-tooltip="Save your work">Save</button>
```

The binding handler signature:

```ts
type BindingHandler = (
  el: HTMLElement,
  expression: string,      // the raw attribute value
  stores: Record<string, unknown>  // all registered stores
) => Cleanup | void
```

If the handler returns a function, Ion calls it as cleanup when the element is removed from `applyBindings` scope.

`App.use()` is idempotent — installing the same plugin twice is a no-op.

```js
App
  .use(TooltipPlugin)
  .use(LazyImagePlugin)
  .use(AnimationPlugin)
```

---

## TypeScript

Ion is written in TypeScript. State shapes are fully inferred.

```ts
interface CartItem {
  name: string
  price: number
  quantity: number
}

interface CartState {
  items: CartItem[]
  coupon: string | null
  discount: number
}

const cart = App.store<CartState>('cart', {
  items: [],
  coupon: null,
  discount: 0,
})

// Fully typed — IDE autocomplete works on store.state
cart.state.items.push({ name: 'Coffee', price: 12.9, quantity: 1 })
cart.state.discount = 0.15

// watch callback value is typed as unknown by default
// you can narrow it:
cart.watch('discount', (value) => {
  const pct = value as number
  console.log(`Discount: ${pct * 100}%`)
})
```

Computed properties:

```ts
const store = createStore(
  { price: 100, tax: 0.1 },
  {
    computed: {
      total: (state): number => state.price * (1 + state.tax),
    },
  }
)
```

Plugin with typed binding:

```ts
import type { Plugin, BindingHandler } from '@matheusmntt/ion'

const MyPlugin: Plugin = {
  install(ctx) {
    const handler: BindingHandler = (el, expression) => {
      // ...
    }
    ctx.registerBinding('data-my-directive', handler)
  },
}
```

---

## Using Without a Bundler

Ion ships a self-contained IIFE build. Load it with a `<script>` tag and everything is available under the `Ion` global.

```html
<!DOCTYPE html>
<html>
<head>
  <title>My PHP App</title>
</head>
<body>

  <!-- Server-rendered content -->
  <div data-user>
    <p>Hello, <span data-bind="name"></span>!</p>
    <input data-model="name" type="text" placeholder="Your name">
  </div>

  <script src="/vendor/ion/dist/ion.global.js"></script>
  <script>
    const { App } = Ion

    const user = App.store('user', {
      name: '<?= htmlspecialchars($user->name) ?>'
    })

    App.bind(document.querySelector('[data-user]'), user)
  </script>

</body>
</html>
```

For `<script type="module">`:

```html
<script type="module">
  import { App } from '/vendor/ion/dist/ion.js'

  const store = App.store('counter', { count: 0 })
  // ...
</script>
```

---

## Architecture

```
index.ts
└── src/
    ├── app.ts          AppCore singleton + public API
    ├── store.ts        createStore — reactive state container
    ├── bindings.ts     DOM binding directives + applyBindings
    ├── component.ts    Component registry + lifecycle management
    ├── reactivity.ts   Proxy engine, scheduler, effect, batch
    └── types.ts        TypeScript interfaces and type definitions
```

### Reactivity pipeline

```
store.state.count = 1
        │
        ▼
  deepReactive Proxy (set trap)
        │
        ▼
  notify(prop, value)
        │
  ┌─────┴──────────────────────────────────┐
  ▼                                        ▼
subscribers                           watchers
  │                                    (path diff)
  └─────────────────┬──────────────────────┘
                    ▼
              queueNotification()
                    │
          ┌─────────┴─────────┐
          │ inside batch?     │
          ▼                   ▼
    push to queue        schedule()
                              │
                              ▼
                        queueMicrotask
                              │
                              ▼
                    flush all callbacks
```

Key design decisions:

- **Proxy-based, no compilation.** Ion never parses your templates or transforms your code. Reactivity is pure runtime.
- **WeakMap proxy cache.** The same raw object always returns the same proxy, so reference equality is preserved.
- **Microtask batching.** Multiple synchronous mutations in a tick produce one flush. The scheduler deduplicates identical callbacks.
- **Loop detection.** If a subscriber triggers mutations that re-trigger subscribers indefinitely, Ion throws after 100 nested flush cycles instead of hanging the browser.
- **WeakMap component registry.** Component instances and cleanup functions are stored in WeakMaps, not as properties on DOM nodes. No conflicts, no leaks.

---

## API Reference

### `App`

| Method | Signature | Description |
|---|---|---|
| `store` | `(name, initialState, options?) → Store` | Creates and registers a named store |
| `getStore` | `(name) → Store` | Retrieves a registered store by name |
| `component` | `(selector, factory) → this` | Registers a component factory |
| `bind` | `(root, store) → Cleanup` | Applies bindings from a store to a DOM subtree |
| `effect` | `(callback) → Cleanup` | Creates a self-tracking reactive effect |
| `batch` | `(fn) → void` | Groups mutations into a single notification cycle |
| `use` | `(plugin) → this` | Installs a plugin |
| `start` | `() → void` | Mounts all registered components in the document |
| `mount` | `(root) → void` | Mounts components in a specific subtree |
| `destroy` | `(el) → void` | Destroys a single component instance |
| `destroySubtree` | `(el) → void` | Destroys all components in a subtree |

---

### `Store<T>`

| Property/Method | Signature | Description |
|---|---|---|
| `state` | `T` | The reactive state proxy |
| `subscribe` | `(fn: (state) → void) → Cleanup` | Subscribe to any change |
| `onChange` | `(fn: (prop, value, state) → void) → Cleanup` | Subscribe with full change details |
| `watch` | `(path, fn: (value, state) → void) → Cleanup` | Watch a specific path (dot-notation) |

---

### `createStore(initialState, options?)`

Standalone store factory — not registered on `App`.

```ts
createStore<T extends State>(
  initialState: T,
  options?: {
    computed?: Record<string, (state: T) => unknown>
  }
): Store<T>
```

---

### DOM Binding Directives

| Attribute | Syntax | Description |
|---|---|---|
| `data-bind` | `"path"` | Sets `textContent` |
| `data-show` | `"path"` | Toggles `hidden` |
| `data-model` | `"path"` | Two-way value binding (input, textarea, select) |
| `data-attr` | `"path:attrName"` | Sets an HTML attribute |
| `data-class` | `"path:className"` | Toggles a CSS class |
| `data-for` | `"arrayPath"` | Renders a list; child with `data-for-item` is the template |

---

### `applyBindings(root, store, customBindings?)`

```ts
applyBindings<T extends State>(
  root: HTMLElement,
  store: Store<T>,
  customBindings?: Map<string, BindingHandler>
): Cleanup
```

Scans `root` and its subtree, applies all matching directives, and sets up a `MutationObserver` for dynamically added elements. Returns a cleanup function that disconnects everything.

---

### `effect(callback)`

```ts
effect(callback: () => void | (() => void)): Cleanup
```

Runs `callback` immediately and re-runs it when any reactive property it reads changes. Returns a stop function.

---

### `batch(fn)`

```ts
batch(fn: () => void): void
```

Executes `fn` synchronously, deferring all notifications until it returns. Nestable.

---

### Plugin Interface

```ts
interface Plugin {
  install(ctx: PluginContext): void
}

interface PluginContext {
  registerBinding(attribute: string, handler: BindingHandler): void
}

type BindingHandler = (
  el: HTMLElement,
  expression: string,
  stores: Record<string, unknown>
) => Cleanup | void
```

---

## License

MIT © Matheus Monteiro
