module.exports = {
  tabWidth: 4,
  printWidth: 120,
  proseWrap: 'preserve',
  semi: false,
  trailingComma: 'es5',
  singleQuote: true,
  arrowParens: 'avoid',
  overrides: [
    {
      files: '{*.js?(on),*.js,*.y?(a)ml,.*.js?(on),.*.y?(a)ml,*.md,.prettierrc,.stylelintrc,.babelrc}',
      options: {
        tabWidth: 2,
      },
    },
    {
      files: '{**/.vscode/*.json,**/tsconfig.json,**/tsconfig.*.json}',
      options: {
        parser: 'json5',
        quoteProps: 'preserve',
        singleQuote: false,
        trailingComma: 'all',
      },
    },
  ],
  plugins: ['@ianvs/prettier-plugin-sort-imports'],
  importOrder: [
    '^react$',
    '',
    '<THIRD_PARTY_MODULES>', // Note: Any unmatched modules will be placed here
    '',
    '^@sourcegraph/(.*)$', // Any internal module
    '',
    '^(?!.*.s?css$)(?!\\.\\/)(\\.\\.\\/.*$|\\.\\.$)', // Matches parent directory paths, e.g. "../Foo", or "../../Foo". or ".."
    '',
    '^(?!.*.s?css$)(\\.\\/.*$|\\.$)', // Matches sibling directory paths, e.g. "./Foo" or ".",
    '',
    '.*\\.s?css$', // SCSS imports. Note: This must be last to ensure predictable styling.
  ],
}
