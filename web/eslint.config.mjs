// ESLint flat config (ESLint 9 / eslint-config-next 16).
// Next 16 移除了 `next lint` 与 .eslintrc 兼容，统一用 `eslint .` + flat config。
// 规则面与旧 .eslintrc.json 保持一致：next/core-web-vitals + prettier + 自定义，
// 刻意不引入 next/typescript（那会顺带收紧整套 TS 规则，超出本次升级范围）。
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
      // eslint-config-next 16 捆绑的新版 react-hooks 插件新增了这两条规则
      // （config-next 15 时代没有）。代码本身未变，为保证本次升级行为等价、
      // 不凭空阻断 lint，先降级为 warn 留痕，待后续单独治理 effect 写法。
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
]

export default eslintConfig
