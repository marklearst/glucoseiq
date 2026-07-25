/**
 * diabetic-utils compatibility shim.
 *
 * This package now re-exports {@link https://www.npmjs.com/package/@glucoseiq/core | @glucoseiq/core}.
 * The 107 supported root exports from `diabetic-utils@1.5.0` remain available;
 * new projects should depend on `@glucoseiq/core` directly.
 *
 * @see https://glucoseiq.dev
 */
export * from '@glucoseiq/core'
