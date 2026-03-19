// ─────────────────────────────────────────────────────────────────────────────
// App singleton
// ─────────────────────────────────────────────────────────────────────────────

export { App } from "./src/app"

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export { createStore } from "./src/store"
export type { Store, StoreOptions, ComputedDefinition } from "./src/store"

// ─────────────────────────────────────────────────────────────────────────────
// Reactivity primitives
// ─────────────────────────────────────────────────────────────────────────────

export { effect, batch, deepReactive, schedule } from "./src/reactivity"

// ─────────────────────────────────────────────────────────────────────────────
// Bindings
// ─────────────────────────────────────────────────────────────────────────────

export {
  applyBindings,
  bindText,
  bindShow,
  bindModel,
  bindAttr,
  bindClass,
} from "./src/bindings"

// ─────────────────────────────────────────────────────────────────────────────
// Component registry
// ─────────────────────────────────────────────────────────────────────────────

export { createComponentRegistry } from "./src/component"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  State,
  Subscriber,
  ChangeListener,
  WatchCallback,
  EffectCallback,
  Cleanup,
  ComponentFactory,
  ComponentInstance,
  Plugin,
  PluginContext,
  BindingHandler,
} from "./src/types"
