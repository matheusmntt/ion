import { createStore, Store, StoreOptions } from "./store"
import { createComponentRegistry } from "./component"
import { applyBindings } from "./bindings"
import { effect, batch } from "./reactivity"
import {
  State,
  ComponentFactory,
  Plugin,
  PluginContext,
  BindingHandler,
  Cleanup,
} from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// AppCore
// ─────────────────────────────────────────────────────────────────────────────

class AppCore {
  /** All named stores registered on this App instance. */
  readonly stores: Record<string, Store<any>> = {}

  private readonly registry = createComponentRegistry()
  private readonly customBindings = new Map<string, BindingHandler>()
  private readonly installedPlugins = new Set<Plugin>()

  // ── Store ──────────────────────────────────────────────────────────────────

  /**
   * Creates and registers a named reactive store.
   *
   * @example
   * const store = App.store('ui', { count: 0, title: 'Hello' })
   */
  store<T extends State>(
    name: string,
    initialState: T,
    options: StoreOptions<T> = {}
  ): Store<T> {
    if (this.stores[name]) {
      console.warn(`[App] Store "${name}" already exists. Returning existing instance.`)
      return this.stores[name] as Store<T>
    }

    const store = createStore(initialState, options)
    this.stores[name] = store
    return store
  }

  /**
   * Retrieves a previously registered store by name.
   * Throws if the store does not exist.
   */
  getStore<T extends State>(name: string): Store<T> {
    const store = this.stores[name]
    if (!store) {
      throw new Error(`[App] Store "${name}" not found. Did you call App.store() first?`)
    }
    return store as Store<T>
  }

  // ── Component ──────────────────────────────────────────────────────────────

  /**
   * Registers a component factory for a CSS selector.
   *
   * @example
   * App.component('[data-counter]', (el) => {
   *   // ... setup
   *   return { cleanup: () => { ... } }
   * })
   */
  component(selector: string, factory: ComponentFactory): this {
    this.registry.register(selector, factory)
    return this
  }

  /**
   * Destroys a specific component instance.
   */
  destroy(el: HTMLElement): void {
    this.registry.destroy(el)
  }

  /**
   * Destroys all component instances within a subtree.
   */
  destroySubtree(el: HTMLElement): void {
    this.registry.destroySubtree(el)
  }

  // ── Bindings ───────────────────────────────────────────────────────────────

  /**
   * Applies reactive bindings from a store to a root DOM element.
   * Custom bindings registered via plugins are included automatically.
   *
   * @example
   * const store = App.store('form', { name: '' })
   * App.bind(document.querySelector('.form'), store)
   */
  bind<T extends State>(root: HTMLElement, store: Store<T>): Cleanup {
    return applyBindings(root, store, this.customBindings)
  }

  // ── Effects ────────────────────────────────────────────────────────────────

  /**
   * Creates a reactive effect. The callback runs immediately and re-runs
   * whenever any reactive state it reads changes.
   *
   * Returns a stop function.
   *
   * @example
   * App.effect(() => {
   *   document.title = store.state.pageTitle
   * })
   */
  effect(callback: () => void | (() => void)): Cleanup {
    return effect(callback)
  }

  /**
   * Batches multiple state mutations into a single notification cycle.
   *
   * @example
   * App.batch(() => {
   *   store.state.firstName = 'Ana'
   *   store.state.lastName  = 'Lima'
   * })
   */
  batch(fn: () => void): void {
    batch(fn)
  }

  // ── Plugins ────────────────────────────────────────────────────────────────

  /**
   * Installs a plugin. Each plugin is installed at most once.
   *
   * @example
   * App.use({
   *   install(ctx) {
   *     ctx.registerBinding('data-tooltip', (el, expr, stores) => {
   *       el.title = expr
   *     })
   *   }
   * })
   */
  use(plugin: Plugin): this {
    if (this.installedPlugins.has(plugin)) {
      console.warn("[App] Plugin already installed. Skipping.")
      return this
    }

    const ctx: PluginContext = {
      registerBinding: (attribute: string, handler: BindingHandler) => {
        this.customBindings.set(attribute, handler)
      },
    }

    plugin.install(ctx)
    this.installedPlugins.add(plugin)
    return this
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Mounts all registered components found in the document.
   * Call once after all App.component() registrations.
   */
  start(): void {
    this.registry.initAll()
  }

  /**
   * Mounts all registered components within a specific root element.
   * Useful for dynamic content added after `start()`.
   */
  mount(root: HTMLElement): void {
    this.registry.init(root)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────────────────

export const App = new AppCore()

declare global {
  interface Window {
    App: AppCore
  }
}

window.App = App
