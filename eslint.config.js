import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            'node_modules/**', 'allure-report/**', 'allure-results/**',
            'test-results/**', 'apps/**',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.mocha,
                browser: 'readonly',
                driver: 'readonly',
                $: 'readonly',
                $$: 'readonly',
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'warn',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single'],
            'indent': ['error', 4],
        },
    },
    {
        // Helpers, configs and scripts log progress deliberately — a cloud/CI run is often
        // diagnosable only from its stdout.
        files: ['test/**/*.ts', 'config/**/*.ts', 'scripts/**/*.ts', 'wdio.*.conf.ts', 'templates/**/*.ts'],
        rules: {
            'no-console': 'off',
        },
    },
);
