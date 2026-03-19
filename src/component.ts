import { ComponentFactory, ComponentInstance, Cleanup } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ComponentDefinition {
  selector: string
  factory: ComponentFactory
}

// ─────────────────────────────────────────────────────────────────────────────
// WeakMap registry
// Stores cleanup functions keyed by element — no DOM pollution, GC-friendly.
// ─────────────────────────────────────────────────────────────────────────────

const cleanupMap = new WeakMap<HTMLElement, Cleanup>()
const instanceMap = new WeakMap<HTMLElement, ComponentInstance>()

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an isolated component registry.
 * Multiple registries can coexist (e.g. one per App instance or shadow DOM).
 */
export function createComponentRegistry() {
  const definitions: ComponentDefinition[] = []

  function mountElement(el: HTMLElement, factory: ComponentFactory): void {
    // Prevent double-mounting
    if (instanceMap.has(el)) return

    const instance = factory(el) ?? {}
    instanceMap.set(el, instance)

    if (instance.cleanup) {
      cleanupMap.set(el, instance.cleanup)
    }
  }

  function destroyElement(el: HTMLElement): void {
    const cleanup = cleanupMap.get(el)
    if (cleanup) {
      cleanup()
      cleanupMap.delete(el)
    }
    instanceMap.delete(el)
  }

  return {
    /**
     * Registers a component factory for a CSS selector.
     * Call before `initAll()` or `init(root)`.
     */
    register(selector: string, factory: ComponentFactory) {
      definitions.push({ selector, factory })
    },

    /**
     * Mounts all registered components found in the document.
     */
    initAll() {
      definitions.forEach(({ selector, factory }) => {
        document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
          mountElement(el, factory)
        })
      })
    },

    /**
     * Mounts all registered components found within a specific root element.
     * Useful for dynamic content injection.
     */
    init(root: HTMLElement) {
      definitions.forEach(({ selector, factory }) => {
        root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
          mountElement(el, factory)
        })
        // Mount root itself if it matches
        if (root.matches(selector)) {
          mountElement(root, factory)
        }
      })
    },

    /**
     * Destroys a specific component instance by element.
     */
    destroy(el: HTMLElement) {
      destroyElement(el)
    },

    /**
     * Destroys all component instances found within a subtree (inclusive).
     * Useful for cleaning up dynamically removed sections of the DOM.
     */
    destroySubtree(root: HTMLElement) {
      destroyElement(root)
      root.querySelectorAll<HTMLElement>("*").forEach((el) => {
        destroyElement(el)
      })
    },

    /**
     * Returns the component instance for a given element, if mounted.
     */
    getInstance(el: HTMLElement): ComponentInstance | undefined {
      return instanceMap.get(el)
    },
  }
}
