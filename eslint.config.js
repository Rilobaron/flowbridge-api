export default [
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        node: true,
        process: true,
        console: true,
        setTimeout: true,
        clearTimeout: true,
        setImmediate: true,
        Buffer: true,
        URL: true,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-undef": "off",
    },
  },
];
