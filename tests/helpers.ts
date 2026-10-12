/** Resolves after every pending microtask (including Ion's flush) has run. */
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Builds a detached DOM tree from an HTML string and attaches it to the body. */
export function mount(html: string): HTMLElement {
  const root = document.createElement("div")
  root.innerHTML = html.trim()
  document.body.appendChild(root)
  return root
}
