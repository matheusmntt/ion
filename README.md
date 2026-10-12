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

Ion adds reactive state to any HTML page: no virtual DOM, no build step required, no framework takeover. Drop it into a PHP, Laravel or any other server-rendered application and get fine-grained reactivity exactly where you need it. Each binding tracks the exact state keys it reads and touches the DOM only when its value actually changes.

```html
<!-- Your server-rendered HTML stays untouched -->
<div data-counter>
  <button>+</button>
  <span data-bind="count"></span>
</div>

<script src="https://unpkg.com/@matheusmntt/ion/dist/index.global.js"></script>
<script>
  const counter = Ion.App.store('counter', { count: 0 })

  Ion.App.component('[data-counter]', (el) => {
    Ion.App.bind(el, counter)
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
  - [onChange — Every Change](#onchange--every-change)
  - [Watching a Specific Path](#watching-a-specific-path)
  - [Computed Properties](#computed-properties)
- [DOM Bindings](#dom-bindings)
  - [data-bind — Text](#data-bind--text)
  - [data-show — Visibility](#data-show--visibility)
  - [data-model — Two-Way Input](#data-model--two-way-input)
  - [data-attr — Attribute](#data-attr--attribute-binding)
  - [data-class — Class Toggle](#data-class--class-toggle)
  - [data-for — List Rendering](#data-for--list-rendering)
  - [applyBindings — Manual Binding](#applybindings--manual-binding)
- [Components](#components)
- [Reactivity Primitives](#reactivity-primitives)
  - [effect](#effect)
  - [batch](#batch)
  - [The scheduler](#the-scheduler)
- [Inspector](#inspector)
- [Plugin System](#plugin-system)
- [TypeScript](#typescript)
- [Using Without a Bundler](#using-without-a-bundler)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Development](#development)

---

## Why Ion?

Modern frameworks solve complex problems, but most server-rendered apps don't have complex problems. They need a dropdown that opens, a counter that increments, a form that validates in real time.

Ion is the answer to: _"I just need some reactivity on this PHP page."_

| | Ion | Alpine.js | Vue | React |
|---|---|---|---|---|
| Bundle (min+gz, approx.) | ~4.4 KB | ~15 KB | ~34 KB | ~45 KB |
| Virtual DOM | No | No | Yes | Yes |
| Build step required | No | No | Optional | Yes |
| Server-rendered friendly | ✓ | ✓ | Partial | Partial |
| TypeScript-first | ✓ | Partial | ✓ | ✓ |
| Framework takeover | No | No | Yes | Yes |

Ion's own figure is measured from `dist/index.js` (gzip -9); the others are rough orientation only.

Ion focuses on three things: **reactive state**, **declarative bindings**, and **explicit component lifecycle**. Nothing more.

---

## Installation

**npm / yarn / pnpm:**

```bash
npm install @matheusmntt/ion
```

**CDN (no build step):**

```html
<!-- IIFE — exposes window.Ion -->
<script src="https://unpkg.com/@matheusmntt/ion/dist/index.global.js"></script>

<!-- ESM -->
<script type="module">
  import { App } from 'https://unpkg.com/@matheusmntt/ion/dist/index.js'
</script>
```

**Local build:**

```bash
git clone https://github.com/matheusmntt/ion
cd ion
npm install
npm run build
# → dist/index.global.js  (IIFE, for <script src>)
# → dist/index.js         (ESM, for <script type="module"> and bundlers)
# → dist/index.cjs        (CJS, for require())
```

Importing Ion on the server (SSR, Node scripts) is safe: the `window.App` global is only assigned when a `window` exists.

---

## Core Concepts

Ion is built on three primitives. Understanding them is all you need.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Store ──► holds reactive state (a deep Proxy)             │
│     │                                                       │
│     └──► Bindings ──► keep the DOM in sync, key by key      │
│     │                                                       │
│     └──► Components ──► attach behavior to elements         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Stores are the single source of truth. Bindings, effects and computed values record which keys they read; when one of those keys changes, only they re-run.

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

Calling `App.store` again with a name that already exists logs a warning and returns the existing store.

---

### Reading State

Read properties directly from `store.state`:

```js
console.log(counter.state.count) // 0
```

Nested plain objects and arrays are fully reactive:

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

Only plain objects and arrays are made reactive. Values such as `Date`, `Map`, `Set` or DOM nodes are stored as-is, so their methods keep working. Replace them to trigger an update.

---

### Mutating State

Assign directly to any property at any depth:

```js
counter.state.count = 5
counter.state.count++

store.state.profile.name = 'João'
store.state.profile.address.city = 'Curitiba'

store.state.items.push(newItem)   // array methods work too
delete store.state.flags.legacy   // so does delete
```

There is no `setState`, no `commit`, no `dispatch`. Ion uses a Proxy to intercept mutations and schedule updates automatically. Assigning the value a key already holds is a no-op.

---

### Subscribing to Changes

`subscribe` is store-wide: it fires when **any** property in the store changed. The callback receives the state.

```js
const unsubscribe = counter.subscribe((state) => {
  console.log('state changed:', state.count)
})

counter.state.count++
counter.state.count++
// → "state changed: 2" (once, in the next microtask)

// Stop listening
unsubscribe()
```

Subscribers are deduplicated per flush: however many writes happen in the same tick, each subscriber runs once. Prefer bindings, `effect` or `watch` when you only care about specific keys.

---

### onChange — Every Change

When you need every individual change, use `onChange`. It is called once per change, with the changed key, its new value, the state and the full path from the store root:

```js
const unlisten = store.onChange((prop, value, state, path) => {
  console.log(`${path.join('.')} → ${value}`)
})

store.state.profile.name = 'João'
// → "profile.name → João"

unlisten()
```

Both `subscribe` and `onChange` return a cleanup function. Call it when you no longer need the subscription.

---

### Watching a Specific Path

`watch` targets a property, or a **nested path** using dot notation. It tracks every key along the path, so it fires when the leaf changes or when an object on the path is replaced:

```js
counter.watch('count', (value, state) => {
  console.log('count is now', value)
})

store.watch('profile.name', (value) => {
  document.title = value
})

store.state.profile.name = 'João'         // fires 'profile.name'
store.state.profile = { name: 'Bia' }     // fires 'profile.name' too
store.state.profile.name = 'Bia'          // does NOT fire — same value
```

The callback runs in the flush and only if the value at the path differs (`!==`) from the last value it saw. Changing a value and changing it back within the same tick does not fire.

```js
// All watch calls return an unwatch function
const unwatch = counter.watch('count', callback)
unwatch()
```

---

### Computed Properties

Computed properties are derived values that are **cached** and recalculated only when one of their own dependencies changes.

```js
const store = App.store(
  'cart',
  {
    items: [
      { name: 'Coffee', price: 12.9 },
      { name: 'Book',   price: 49.0 },
    ],
    discount: 0.1,
    note: '',
  },
  {
    computed: {
      total(state) {
        return state.items.reduce((sum, item) => sum + item.price, 0)
      },

      // Computeds can read other computeds
      finalPrice(state) {
        return state.total * (1 - state.discount)
      },
    },
  }
)

console.log(store.state.total)      // 61.9
console.log(store.state.finalPrice) // 55.71

store.state.note = 'gift'           // unrelated: total stays cached
store.state.discount = 0.2          // finalPrice is invalidated, total is not
```

Computed values are **lazy**: a computed records the keys it reads every time it is evaluated, and is marked dirty when one of them changes. Bindings, effects and watchers that read a computed re-run when it is invalidated, then read the fresh value. They behave like regular state properties for bindings:

```html
<span data-bind="total"></span>
<span data-bind="finalPrice"></span>
```

Computed properties are read-only; assigning to one throws.

---

## DOM Bindings

Bindings are HTML attributes that connect the DOM to a store. Each binding is a small reactive effect: it reads its path, records exactly the keys it read, and re-runs only when one of them changes. When it re-runs it compares the new value with what the DOM already holds and skips the write if they are equal.

---

### data-bind — Text

Sets the `textContent` of an element to the value at a given path (`null`/`undefined` become an empty string).

```html
<span data-bind="count"></span>
<span data-bind="user.name"></span>
<span data-bind="finalPrice"></span>
```

```js
const store = App.store('ui', {
  count: 0,
  user: { name: 'Ana' },
})

App.bind(document.body, store)

store.state.user.name = 'João'
// → <span>João</span>   (the count binding does not run)
```

---

### data-show — Visibility

Toggles `element.hidden` based on the truthiness of the value at the given path.

```html
<div data-show="isLoggedIn">
  Welcome back!
</div>
```

When the value is falsy, the element is hidden via the native `hidden` attribute. When truthy, `hidden` is removed. CSS that sets `display` on the element overrides `hidden`.

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

- Checkboxes bind to `.checked` and write booleans.
- Everything else binds to `.value` and writes **strings** (convert numbers yourself).
- `<select>` listens to `change`; other fields listen to `input`.
- Radio groups and `<select multiple>` are not supported.

Because identical values are never written back, typing in a bound field does not move the caret.

---

### data-attr — Attribute Binding

Binds a state value to an HTML attribute. Syntax: `"path:attributeName"` (split on the last colon).

```html
<img data-attr="user.avatar:src">
<a  data-attr="nav.href:href">Dashboard</a>
<div data-attr="ui.label:aria-label"></div>
```

If the value is `null` or `undefined`, the attribute is **removed** from the element. Otherwise, it is set to `String(value)`.

---

### data-class — Class Toggle

Conditionally toggles a CSS class. Syntax: `"path:className"` (split on the last colon, so class names cannot contain one).

```html
<button data-class="ui.isLoading:loading">Submit</button>
<div    data-class="form.isValid:valid">...</div>
```

```js
store.state.ui.isLoading = true
// → <button class="loading">Submit</button>
```

---

### data-for — List Rendering

Renders a list of elements from an array in the store. The parent element acts as the container; its direct child with `data-for-item` is the template.

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

Each item is rendered with its own scoped store, holding a shallow copy of the item plus `$index` (primitive items are exposed as `$value`).

| Variable | Value |
|---|---|
| `text` | The item's `text` property |
| `done` | The item's `done` property |
| `$index` | The item's position in the array (0-based) |

The list re-renders when the array is replaced, when its length changes, or when a property of an item that it rendered changes. Writes to unrelated keys of the store do not touch it.

> **Limitations:** lists are not keyed — the whole list is rebuilt on every change, so focus inside an item is lost. The container's other children are removed. Writes made through an item's scope (for example `data-model` inside the template) change the copy, not the original array. For interactive or large lists, prefer a component that renders the list itself.

---

### applyBindings — Manual Binding

You can connect a store to any DOM subtree manually, bypassing the `App` singleton.

```js
import { applyBindings, createStore } from '@matheusmntt/ion'

const store = createStore({ name: 'Ana', visible: true })

const cleanup = applyBindings(
  document.querySelector('#my-widget'),
  store
)

// Later, disconnect everything
cleanup()
```

`applyBindings` scans the root element and its descendants for binding attributes and connects them. It also observes the subtree with a `MutationObserver`: elements added later are bound to the same store, and the bindings of elements removed from the root are stopped.

Each element should be bound by one `applyBindings` root. Nested roots bound to different stores would bind the inner elements twice.

---

## Components

Components attach JavaScript behavior to DOM elements. They are defined by a CSS selector and a factory function. A component has no template, props or children of its own: it receives the matched element and wires it up, usually with stores, bindings and effects.

### Registering a Component

```js
App.component('[data-counter]', (el) => {
  const store = App.getStore('counter')
  const button = el.querySelector('button')

  const unbind = App.bind(el, store)
  const increment = () => store.state.count++
  button.addEventListener('click', increment)

  // Return a cleanup object to free resources when destroyed
  return {
    cleanup() {
      button.removeEventListener('click', increment)
      unbind()
    },
  }
})
```

The factory runs once per matched element and can optionally return `{ cleanup }`. `App.component()` is chainable:

```js
App
  .component('[data-counter]', counterFactory)
  .component('[data-modal]',   modalFactory)
```

### Lifecycle

```
App.start() / App.mount(el)
        │
        ▼
   factory(el) called (once per element)
        │
        ▼
   instance stored in the registry (WeakMap keyed by element)
        │
        ▼
   App.destroy(el) / App.destroySubtree(el)
        │
        ▼
   instance.cleanup() called, instance forgotten
```

- `App.start()` mounts every registered component found in the document. Call it once after registering components.
- `App.mount(root)` mounts components inside content added later (HTMX responses, modals…).
- Removing an element from the DOM does **not** call its `cleanup`. Call `App.destroy(el)` or `App.destroySubtree(el)` before removing it.
- Each element is mounted at most once per registry. Registries created with `createComponentRegistry()` are independent of each other.

---

## Reactivity Primitives

### effect

`effect` runs a callback immediately and re-runs it whenever any reactive state it read changes. Dependencies are **tracked automatically** on every run, so they can change from one run to the next.

```js
const store = App.store('page', { title: 'Home', visits: 0 })

const stop = App.effect(() => {
  document.title = store.state.title
}, { label: 'page-title' })

store.state.title = 'About'
// → document.title === 'About' (next microtask)

store.state.visits++
// → effect does NOT re-run (visits was never read)

stop()
```

The callback may return a cleanup function, which Ion calls before each re-run and when the effect is stopped. Stopping an effect also cancels a re-run that was already queued.

An effect never re-triggers itself: writing a key it also reads (`count++`) does not schedule it again. The optional `label` is shown by inspectors and in loop-detection errors.

---

### batch

`batch` changes **when** notifications run, not how many: reactions triggered inside it are collected and run synchronously, once each, when the outermost `batch` returns.

```js
const store = App.store('form', { firstName: '', lastName: '' })

// Without batch: every reaction that depends on these keys runs once,
// in the next microtask.
store.state.firstName = 'Ana'
store.state.lastName  = 'Lima'

// With batch: the same reactions run once each, synchronously,
// before batch() returns — the DOM is up to date on the next line.
App.batch(() => {
  store.state.firstName = 'Ana'
  store.state.lastName  = 'Lima'
})
```

`batch` calls are **nestable**. Notifications flush only when the outermost `batch` completes.

---

### The scheduler

Outside `batch`, reactions are queued in a `Set` and flushed in a microtask, so a reaction runs at most once per flush however many of its dependencies changed. Reactions queued while a flush is running are handled by the same flush in a new round.

- **Errors** thrown by a reaction are reported (`reportError` in browsers, `console.error` elsewhere) and do not stop the other reactions in the flush.
- **Loop detection:** if updates are still re-triggering each other after 100 rounds, Ion stops the flush and reports an error naming the reactions involved, instead of hanging the page.

---

## Inspector

`setInspector` installs an observer of Ion's internals, for devtools, tests and visualizations. When no inspector is installed each call site is skipped by a single null check.

```js
import { setInspector } from '@matheusmntt/ion'

const stop = setInspector({
  commit: (e) => console.log('write', e.path.join('.'), e.prev, '→', e.next),
  enqueue: (e) => console.log('queued', e.reaction.label, e.deduped ? '(already queued)' : ''),
  domWrite: (e) => console.log(e.reaction.label, e.applied ? 'wrote' : 'skipped', e.next),
})

// later
stop()
```

| Event | When |
|---|---|
| `storeCreate(store)` | A store was created (`id`, `name`) |
| `reactionCreate(reaction)` / `reactionDispose(reaction)` | A binding, effect, computed, subscriber or watcher was created / stopped |
| `commit(e)` | A write changed state (`storeId`, `path`, `prev`, `next`, `op`), before anything is notified |
| `writeSkipped(e)` | A write assigned the value the key already held |
| `track(e)` | A reaction read a key and now depends on it |
| `invalidate(reaction)` | A computed was marked dirty |
| `enqueue(e)` | A reaction was queued in the `microtask` or `batch` lane (`deduped` if it was already waiting) |
| `flushStart(e)` / `flushEnd(e)` | A flush round started / ended |
| `batchStart()` / `batchEnd()` | The outermost `batch` began / returned |
| `runStart(reaction)` / `runEnd(reaction, error)` | A reaction ran |
| `domWrite(e)` | A binding compared a value with the DOM (`applied: false` when the write was skipped) |

Each reaction is described by a stable `ReactionInfo` (`id`, `kind`, `label`, and for bindings `directive`, `path`, `element` and `storeId`).

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

After installing, `data-tooltip` works in any subtree bound with `App.bind`:

```html
<button data-tooltip="Save your work">Save</button>
```

The binding handler signature:

```ts
type BindingHandler = (
  el: HTMLElement,
  expression: string,               // the raw attribute value
  stores: Record<string, unknown>,  // stores registered on App (empty when using applyBindings directly)
  store: unknown                    // the store being bound
) => Cleanup | void
```

The handler runs once per element when it is bound. Use `store` with `effect` to make it reactive. If the handler returns a function, Ion calls it when the element is removed from the bound root or when the bindings are cleaned up.

`App.use()` is idempotent — installing the same plugin twice is a no-op.

---

## TypeScript

Ion is written in TypeScript. State shapes are fully inferred.

```ts
interface CartState {
  items: { name: string; price: number; quantity: number }[]
  coupon: string | null
  discount: number
}

const cart = App.store<CartState>('cart', {
  items: [],
  coupon: null,
  discount: 0,
})

cart.state.items.push({ name: 'Coffee', price: 12.9, quantity: 1 })
cart.state.discount = 0.15

// watch callback values are typed as unknown; narrow them:
cart.watch('discount', (value) => {
  const pct = value as number
  console.log(`Discount: ${pct * 100}%`)
})
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

Ion ships a self-contained IIFE build. Load it with a `<script>` tag and everything is available under the `Ion` global (and `window.App`).

```html
<!DOCTYPE html>
<html>
<body>

  <!-- Server-rendered content -->
  <div data-user>
    <p>Hello, <span data-bind="name"></span>!</p>
    <input data-model="name" type="text" placeholder="Your name">
  </div>

  <script src="/vendor/ion/dist/index.global.js"></script>
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
  import { App } from '/vendor/ion/dist/index.js'

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
    ├── store.ts        createStore — state, subscribers, computed, watch
    ├── bindings.ts     DOM binding directives + applyBindings
    ├── component.ts    Component registry + lifecycle management
    ├── reactivity.ts   Proxy engine, dependency tracking, scheduler, effect, batch
    ├── inspector.ts    Optional devtools hook
    └── types.ts        TypeScript interfaces and type definitions
```

### Reactivity pipeline

```
store.state.count = 1
        │
        ▼
  Proxy set trap ── same value? ──► stop
        │
        ├──► store-wide listeners (subscribe, onChange)
        │
        └──► reactions that read `count`
               (bindings, effects, watchers; computeds are marked
                dirty and pass the trigger on to their own readers)
                         │
               ┌─────────┴─────────┐
               │ inside batch()?   │
               ▼                   ▼
         batch queue         microtask queue
     (runs when batch       (Set: each reaction
        returns)              once per flush)
               └─────────┬─────────┘
                         ▼
                 reactions re-run
                         │
                         ▼
          bindings compare with the DOM
          and write only what changed
```

Key design decisions:

- **Proxy-based, no compilation.** Ion never parses your templates or transforms your code. Reactivity is pure runtime.
- **Key-level dependency tracking.** Dependencies are recorded per (object, key) on every run, including `in`, `Object.keys` and array length.
- **Per-store proxy cache.** The same raw object always returns the same proxy within a store, so reference equality is preserved.
- **Deduplicated microtask flushes** with a round limit for loop detection.
- **WeakMap component registry.** Component instances and cleanup functions are stored in WeakMaps owned by each registry, not as properties on DOM nodes.

---

## API Reference

### `App`

| Method | Signature | Description |
|---|---|---|
| `store` | `(name, initialState, options?) → Store` | Creates and registers a named store |
| `getStore` | `(name) → Store` | Retrieves a registered store by name |
| `stores` | `Record<string, Store>` | All registered stores |
| `component` | `(selector, factory) → this` | Registers a component factory |
| `bind` | `(root, store) → Cleanup` | Applies bindings (including plugin bindings) to a DOM subtree |
| `effect` | `(callback, options?) → Cleanup` | Creates a self-tracking reactive effect |
| `batch` | `(fn) → void` | Runs `fn`, then flushes its notifications synchronously |
| `use` | `(plugin) → this` | Installs a plugin |
| `start` | `() → void` | Mounts all registered components in the document |
| `mount` | `(root) → void` | Mounts components in a specific subtree |
| `destroy` | `(el) → void` | Destroys a single component instance |
| `destroySubtree` | `(el) → void` | Destroys all components in a subtree |

---

### `Store<T>`

| Property/Method | Signature | Description |
|---|---|---|
| `id` | `number` | Unique id (reported to inspectors) |
| `name` | `string \| null` | Name given by `App.store` or `options.name` |
| `state` | `T` | The reactive state proxy |
| `subscribe` | `(fn: (state) → void) → Cleanup` | Store-wide, once per flush |
| `onChange` | `(fn: (prop, value, state, path) → void) → Cleanup` | Every individual change |
| `watch` | `(path, fn: (value, state) → void) → Cleanup` | Watch a specific path (dot-notation) |

---

### `createStore(initialState, options?)`

Standalone store factory — not registered on `App`.

```ts
createStore<T extends State>(
  initialState: T,
  options?: {
    computed?: Record<string, ((state: T) => unknown) | { get: (state: T) => unknown }>
    name?: string
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
| `data-attr` | `"path:attrName"` | Sets or removes an HTML attribute |
| `data-class` | `"path:className"` | Toggles a CSS class |
| `data-for` | `"arrayPath"` | Renders a list; direct child with `data-for-item` is the template |

---

### `applyBindings(root, store, customBindings?, stores?)`

```ts
applyBindings<T extends State>(
  root: HTMLElement,
  store: Store<T>,
  customBindings?: Map<string, BindingHandler>,
  stores?: Record<string, Store<any>>
): Cleanup
```

Scans `root` and its subtree, applies all matching directives, and observes the subtree to bind added elements and release removed ones. Returns a cleanup function that disconnects everything.

---

### `effect(callback, options?)`

```ts
effect(callback: () => void | (() => void), options?: { label?: string }): Cleanup
```

Runs `callback` immediately and re-runs it when any reactive property it read changes. Returns a stop function.

---

### `batch(fn)`

```ts
batch(fn: () => void): void
```

Executes `fn` synchronously, collecting notifications until the outermost batch returns, then runs each queued reaction once. Nestable.

---

### `setInspector(inspector)`

```ts
setInspector(inspector: Inspector | null): () => void
```

Installs an inspector and returns a function that removes it. See [Inspector](#inspector).

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
  stores: Record<string, unknown>,
  store: unknown
) => Cleanup | void
```

---

## Development

```bash
npm install
npm test          # vitest + happy-dom
npm run typecheck
npm run build
```

Releases are published to npm by GitHub Actions when a GitHub Release is created; the version comes from the release tag. See [CHANGELOG.md](./CHANGELOG.md).

---

## License

MIT © Matheus Monteiro
