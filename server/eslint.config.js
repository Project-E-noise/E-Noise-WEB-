// ESLint for the API: the recommended rules only (real mistakes such as
// unused variables or unreachable code), no style rules. Run: npm run lint
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node }
    },
    rules: {
      // `_next` and `_app` are required by Express/FastAPI-style signatures.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }]
    }
  }
];
