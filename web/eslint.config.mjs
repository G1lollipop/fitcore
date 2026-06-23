// ESLint flat config (ESLint 9 / eslint-config-next 16).
// Next 16 removed `next lint` and .eslintrc compatibility, so we standardize on `eslint .` + flat config.
// The rule set matches the old .eslintrc.json: next/core-web-vitals + prettier + custom rules,
// deliberately not pulling in next/typescript (that would also tighten the whole TS rule set, beyond the scope of this upgrade).
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier/flat'

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      'public/**',
      'next-env.d.ts',
      'lib/database.types.ts',
    ],
  },
  ...coreWebVitals,
  prettier,
  {
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // The newer react-hooks plugin bundled with eslint-config-next 16 adds these two rules
      // (they didn't exist in the config-next 15 era). The code itself is unchanged; to keep this
      // upgrade behavior-equivalent and avoid blocking lint out of nowhere, we downgrade them to
      // warn for now and address the effect patterns separately later.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
]

export default eslintConfig
