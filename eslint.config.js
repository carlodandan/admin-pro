/**
 * Flat config for `pnpm run lint`.
 *
 * The `lint` script and all four ESLint packages were already in
 * `package.json`, but no config file had ever been committed, so the script
 * only ever printed "ESLint couldn't find an eslint.config.(js|mjs|cjs) file".
 * This is that missing file, wired to the plugins that were already declared.
 *
 * Scope is `src/renderer` — the frontend the script names. `src-tauri` is
 * Rust, checked by `cargo clippy` instead.
 */

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/**', 'src-tauri/**', 'node_modules/**'] },

  {
    files: ['src/renderer/**/*.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // The renderer is a webview: browser globals, no Node.
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs['recommended-latest'].rules,
      // Every screen in this app loads through an `async` function called from a
      // mount effect, and the two of those the rule can see — `Header`'s
      // `loadCompanyName` and `UserContext`'s `loadUserProfile` — are reported
      // as errors while the other eight are not, only because their loaders are
      // declared below the effect and so are not analysed. Setting state once
      // the awaited read comes back is the data-loading pattern here, not a
      // cascade, so this stays visible as a warning rather than failing the run
      // on two arbitrary members of a set of ten.
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // A caught error that is deliberately swallowed is named `_`.
      //
      // PascalCase is exempt because ESLint's own scope analysis does not link a
      // JSX reference back to a *renamed destructured parameter*: the
      // `({ icon: Icon }) => <Icon />` prop that `ConfirmDialog` and
      // `RegistrationPage`'s `Field` both take reads as unused, while the same
      // component reached through an import resolves correctly. Covering it
      // properly would mean adding `eslint-plugin-react` for `jsx-uses-vars`,
      // and a component-valued prop is PascalCase here by convention.
      'no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^(_|[A-Z])' },
      ],
    },
  },
];
