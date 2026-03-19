import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["index.ts"],
  format: ["esm", "cjs", "iife"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  bundle: true,
  outDir: "dist",
  globalName: "Ion",
  splitting: false,
  treeshake: true,

  // Garante compatibilidade com browsers sem suporte a top-level await
  // e com ambientes PHP que servem o bundle via <script src="...">
  target: "es2020",

  // Evita que o tsup injete shims de Node.js (process, Buffer, etc.)
  // no bundle IIFE — o ambiente é o browser, não Node
  platform: "browser",

  // Nome do arquivo de saída explícito para facilitar o <script src>
  // dist/ion.global.js  → formato IIFE  (uso via <script>)
  // dist/ion.js         → formato ESM   (uso via <script type="module">)
  // dist/ion.cjs        → formato CJS   (uso via require() em tooling)
  outExtension({ format }) {
    if (format === "iife") return { js: ".global.js" }
    if (format === "esm")  return { js: ".js" }
    return { js: ".cjs" }
  },
})
