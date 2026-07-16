import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next";
import react from "eslint-plugin-react";

const eslintConfig = defineConfig([
  ...next,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
