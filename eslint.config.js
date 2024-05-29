export default [
  {
    extends: ['plugin:@typescript-eslint/recommended'],
    ignores: ['**/node_modules'],
    parser: '@typescript-eslint/parser',
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      'no-useless-assignment': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-const': 'error',
      'prefer-destructuring': 'error',
      'prefer-exponentiation-operator': 'error',
      'prefer-named-capture-group': 'error',
      'prefer-regex-literals': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      'require-yield': 'error',
      'rest-spread-spacing': 'error',
      'sort-imports': 'error',
      'sort-keys': 'error',
      'sort-vars': 'error'
    }
  }
]
