import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

// Layers, highest first: app → widgets → features → entities → shared (see README, "Code layout"). A module imports only
// from layers below its own, never from another slice of its own layer, and reaches a slice only through its index.ts.
const deepImport = {
  regex: "^@/(widgets|features|entities)/[^/]+/",
  message: "Import a slice through its public API (for example @/entities/account), not a file inside it. Inside the slice itself, import relatively.",
}
const climbing = {
  regex: "^\\.\\./\\.\\./",
  message: "A relative import stays inside its slice. Reach anything else through the @/ alias.",
}
const upward = (layers, message) => ({ regex: `^@/(${layers.join("|")})(/|$)`, message })

const boundaries = (files, ...patterns) => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns: [...patterns, deepImport, climbing] }] },
})

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
  boundaries(["src/app/**", "src/proxy.ts"]),
  boundaries(["src/widgets/**"],
    upward(["app", "widgets"], "A widget uses features, entities and shared; not app code or another widget.")),
  boundaries(["src/features/**"],
    upward(["app", "widgets", "features"], "A feature uses entities and shared; not app code, widgets or another feature.")),
  boundaries(["src/entities/**"],
    upward(["app", "widgets", "features", "entities"], "An entity uses only shared; not app code, widgets, features or another entity.")),
  boundaries(["src/shared/**"],
    upward(["app", "widgets", "features", "entities"], "shared is the bottom layer and knows nothing about the product: no app, widget, feature or entity imports.")),
  {
    files: ["src/**"],
    rules: { "import/no-cycle": "error" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
])
