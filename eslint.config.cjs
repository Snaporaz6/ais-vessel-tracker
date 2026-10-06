const js = require("@eslint/js");
const parser = require("@typescript-eslint/parser");
module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "dist/**",
      "frontend/.next/**",
      "**/*.d.ts",
      "playwright-report/**",
      "test-results/**",
      "data/**",
      ".test-data/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
    },
  },
];
