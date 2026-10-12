# Changelog

## 1.1.0

Ion now does what its documentation promised: bindings are fine-grained, notifications are deduplicated, and loop detection works. Most code written for 1.0.x keeps working; the differences are listed under **Behavior changes**.

### Added

- `setInspector()`: an optional devtools hook that reports commits, dependency tracking, queueing, flushes, reaction runs and DOM writes. It costs a null check per call site when unused.
- `effect(fn, { label })`: name an effect for inspectors and loop-detection errors.
- `store.id` and `store.name`; `createStore(state, { name })`.
- `onChange` listeners receive the full path of the change as a fourth argument.
- Custom binding handlers receive the stores registered on `App` and the bound store (`(el, expression, stores, store)`).
- `bindFor` is exported.
- Test suite (vitest + happy-dom), run in CI before publishing.

### Fixed

- **Bindings re-ran on every write to their store** and rewrote the DOM even when nothing changed. Each binding now tracks the keys on its path and skips writes when the DOM already holds the value.
- **Notifications were not deduplicated**: N writes in a tick ran every subscriber N times. Each reaction and subscriber now runs once per flush.
- **`batch()` did not reduce work**; it now runs each queued reaction once, synchronously, when the outermost batch returns.
- **Loop detection never triggered**, so effects that re-triggered each other hung the page. Flushes now stop after 100 rounds and report the reactions involved.
- **A throwing callback dropped the rest of the flush.** Errors are now reported per job and the flush continues.
- **Nested `watch('a.b')` never fired** for nested writes.
- **Effects lost their dependencies when reading cached computed values.** Computeds now track their own dependencies and notify their readers when invalidated.
- **Computed values were invalidated by any write to the store**; they now recompute only when one of their dependencies changes.
- **`data-for` re-bound rendered items to the parent store** after the first re-render, blanking them and leaking subscriptions. The template's children are no longer bound to the parent store either.
- **`applyBindings` never released removed elements**; their bindings are now stopped when they leave the root.
- **`push()` did not re-run effects reading `length`**; `delete`, `in` and `Object.keys` are now tracked too.
- **`Date`, `Map`, `Set` and other built-ins were wrapped in proxies**, breaking their methods. Only plain objects and arrays are made reactive now.
- **Two stores sharing an object** only notified the first store that wrapped it.
- **Stopping an effect did not cancel a re-run already queued.**
- **Component registries shared their instance maps**, so registries were not isolated.
- **Importing Ion without a `window` (SSR) threw**; the `window.App` global is now only assigned in browsers.
- README: corrected the CDN and build file names (`index.global.js`, `index.js`, `index.cjs`), the hero example (it never called `App.bind`), and every claim that did not match the code.

### Behavior changes

- `subscribe` callbacks run once per flush instead of once per write.
- `watch` callbacks run once per flush, and only if the value at the path differs from the last value seen. Changing a value and back within one tick no longer fires.
- An effect that writes a key it also reads no longer re-triggers itself.
- Bindings no longer re-run (or write) when unrelated keys of their store change. Code that relied on that side effect should use `subscribe` instead.
- Values that are not plain objects or arrays (`Date`, `Map`, `Set`, DOM nodes and other built-ins) are stored as-is and are not deeply reactive.
- `data-for` requires the `data-for-item` template to be a direct child of the container.
