import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * Config «flat» de ESLint 9 para el proyecto (React + TypeScript + Vite).
 * El chequeo de tipos lo hace `tsc` (build); acá nos enfocamos en reglas de
 * calidad/seguridad de React (hooks) y en evitar exports que rompan el HMR.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase/.temp'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // `tsc` ya marca los no usados (noUnusedLocals/Parameters); evitamos duplicar ruido.
      '@typescript-eslint/no-unused-vars': 'off',
      // El proyecto usa algunos `any` puntuales y type-casts deliberados contra Supabase.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
