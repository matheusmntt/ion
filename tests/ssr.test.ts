// @vitest-environment node
import { describe, expect, it } from "vitest"

describe("server-side import", () => {
  it("does not touch window when imported without a DOM", async () => {
    expect(typeof window).toBe("undefined")
    const ion = await import("../index")

    const store = ion.createStore({ count: 0 })
    store.state.count = 1
    expect(store.state.count).toBe(1)
  })
})
