import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Use an `as const` tuple/object and derive the union type via `(typeof X)[number]` instead of `enum` (CI-06).',
        },
        {
          selector:
            'VariableDeclarator[id.typeAnnotation] > TSAsExpression[typeAnnotation.typeName.name="const"]',
          message:
            'Do not add an explicit type annotation to an `as const` declaration; define the `as const` tuple once and derive the type via `(typeof X)[number]` (CI-06).',
        },
      ],
    },
  },
);
