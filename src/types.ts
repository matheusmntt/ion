// ─────────────────────────────────────────────────────────────────────────────
// Core state types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * State object stored inside a reactive store.
 */
export type State = Record<string, any>

// ─────────────────────────────────────────────────────────────────────────────
// Listener / callback types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscriber called on ANY store mutation.
 * Receives only the updated state — use when you don't care which prop changed.
 */
export type Subscriber<T extends State> = (state: T) => void

/**
 * Full change listener, called once per change with the changed property (the
 * leaf key), its new value, the state and the full path from the store root.
 */
export type ChangeListener<T extends State> = (
  prop: PropertyKey,
  value: unknown,
  state: T,
  path: string[]
) => void

/**
 * Watch callback for a specific property.
 */
export type WatchCallback<T extends State> = (
  value: unknown,
  state: T
) => void

/**
 * Reactive effect callback.
 * Called immediately and re-called whenever its reactive dependencies change.
 */
export type EffectCallback = () => void | (() => void)

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup / lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cleanup function returned by bindings, effects, or components.
 */
export type Cleanup = () => void

// ─────────────────────────────────────────────────────────────────────────────
// Component types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Component instance returned by a component factory.
 */
export interface ComponentInstance {
  cleanup?: Cleanup
}

/**
 * Component factory function.
 */
export type ComponentFactory = (el: HTMLElement) => ComponentInstance | void

// ─────────────────────────────────────────────────────────────────────────────
// Plugin types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context passed to every plugin install function.
 */
export interface PluginContext {
  /**
   * Register a custom DOM binding directive.
   * The handler receives each matching element, the attribute value, the
   * stores registered on App, and the store being bound.
   */
  registerBinding(
    attribute: string,
    handler: BindingHandler
  ): void
}

/**
 * Handler function for a custom binding directive.
 */
export type BindingHandler = (
  el: HTMLElement,
  expression: string,
  stores: Record<string, unknown>,
  store: unknown
) => Cleanup | void

/**
 * A plugin installable into App.
 */
export interface Plugin {
  install(ctx: PluginContext): void
}
