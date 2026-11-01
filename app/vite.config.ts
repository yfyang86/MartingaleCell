import path from "path"
import fs from "node:fs"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

/* the app version, from package.json, in one place (Sprint 28) */
const APP_VERSION = (JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string }).version

// https://vite.dev/config/
// CC_ISOLATION=off disables the COOP/COEP headers (default: on): they are
// required by the SBCL engine's SharedArrayBuffer, but they crash some
// embedded browsers (Electron guest views — "Invalid guestInstanceId").
// Without them the app is not crossOriginIsolated, the preflight skips
// SBCL and the IDE boots ECL instead — everything else works.
const isolation = process.env.CC_ISOLATION === "off"
  ? {}
  : {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    }

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
    /* crossOriginIsolated: the SBCL engine's worker shares a
     * SharedArrayBuffer with the page (its thread sits inside wasm; the
     * imports are the only door in). ECL/JSCL/mock don't need it. */
    headers: isolation,
  },
  preview: {
    headers: isolation,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
