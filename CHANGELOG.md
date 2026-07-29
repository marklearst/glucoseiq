# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Introduced GlucoseIQ 1.0 as the `@glucoseiq` package ecosystem, led by the
  zero-dependency `@glucoseiq/core` engine.
- Prepared `diabetic-utils` 2.0 as the compatibility bridge from the 1.5.x
  package to `@glucoseiq/core` while preserving existing root imports.
- Moved development, documentation, and releases to the
  [GlucoseIQ repository](https://github.com/marklearst/glucoseiq).
- Updated `estimateGMI` and `GMI_COEFFICIENTS` to use the published mean-CGM
  equation and normalize mmol/L inputs before calculation. Equivalent values
  such as 100 mg/dL and 5.5 mmol/L now both return 5.7%, instead of 5.4% and
  12.1%.
- Deprecated `a1cToGMI`. It remains available for source compatibility and now
  maps A1C through estimated average glucose, so `a1cToGMI(7)` returns 7.0
  instead of 3.48. This compatibility transform is not a CGM-derived GMI.
  It and `estimateEAG` now reject non-positive or non-finite A1C input.

### Fixed

- Corrected the default `getA1CCategory` boundaries in `@glucoseiq/core` 1.0
  and the `diabetic-utils` 2.0 compatibility bridge to match the
  [CDC categories](https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html):
  normal is below 5.7%, prediabetes is 5.7% to below 6.5%, and diabetes is 6.5%
  or higher. Explicit custom maxima remain inclusive. The published
  `diabetic-utils` 1.5.x artifacts are unchanged and remain available via the
  `legacy` dist-tag.
- Corrected Enhanced and pregnancy TIR target assessment to use strict,
  unrounded population boundaries and cumulative TBR/TAR checks, with separate
  Level 2 checks and explicit configured-range disclosure.
- Added the pregnancy Level 2 below-range subset and rejected zero glucose
  values that previously entered Enhanced or pregnancy TIR calculations.
- Changed active percent and TIR summary duration to timestamp-slot coverage so
  duplicates, invalid timestamps, and sparse spans cannot fabricate duration or
  quality. These values estimate data coverage, not sensor wear.
- Tightened glucose-string and GMI-option guards to reject non-finite,
  non-positive, or unsupported runtime values.
- Rejected unsupported Enhanced TIR population values and Enhanced or pregnancy
  TIR unit values instead of silently selecting a different target model.

## [1.5.0] - 2026-03-12

### Added
- **Advanced CGM Metrics Suite**: ADRR (Kovatchev 2006), GRADE with hypo/eu/hyper partitioning (Hill 2007), J-Index (Wojcicki 1995), CONGA intra-day variability (McDonnell 2005), Active Percent wear-time tracking (Danne 2017)
- **AGP Aggregate**: `calculateAGPMetrics()` computes all Tier 1 CGM metrics (mean, SD, CV, LBGI, HBGI, ADRR, GRADE, GRI, J-Index, MODD, CONGA, Active Percent) in a single call
- **LBGI / HBGI**: Low and High Blood Glucose Index risk scores (Kovatchev 2006)
- **GRI**: Glycemia Risk Index with zone A-E classification (Klonoff 2023)
- **MODD**: Mean of Daily Differences for day-to-day glucose variability (Service 1980)
- **CGM Connector Adapters**: `normalizeDexcomEntries()`, `normalizeLibreEntries()`, and `normalizeNightscoutEntries()` map vendor payloads into the shared `NormalizedCGMReading` type with trend and source metadata
- **FHIR CGM IG**: `buildFHIRCGMSummary()`, `buildFHIRSensorReading()`, `buildFHIRSensorReadings()` for HL7 FHIR-aligned CGM observation payloads
- **Open mHealth**: `buildOMHBloodGlucose()`, `buildOMHBloodGlucoseList()`, `buildOMHDataPoint()` for standards-compliant health data exchange
- Edge-case tests for out-of-order timestamps, mixed units, and cross-module interactions

### Changed
- Softened authority-implying medical language across documentation and code comments
- Test suite expanded from 295 to 337 passing tests, maintaining 100% coverage

### Fixed
- Enhanced TIR interval estimation now handles unsorted timestamps
- FHIR component schema alignment and tighter Open mHealth types
- GRI and MODD calculations refined from review feedback

## [1.4.2] - 2024-11-11

### Documentation
- Reworked the README structure and v1.4.0 feature examples
- Added runnable examples for Enhanced TIR and Pregnancy TIR
- Added an architecture diagram and clinical references

## [1.4.1] - 2024-11-11

### Documentation
- Updated README with v1.4.0 feature examples
- Fixed broken code blocks in README
- Added Enhanced TIR usage examples
- Improved visual hierarchy and structure
- Added clinical references section

## [1.4.0] - 2024-11-11

### Added
- `GMI_COEFFICIENTS` constant with documented formula coefficients for GMI/A1C calculations
- [ConversionResult](https://github.com/marklearst/glucoseiq/blob/v1.4.0/src/types.ts) interface for type-safe glucose unit conversion returns
- Type predicates for better TypeScript type narrowing ([isValidInsulin](https://github.com/marklearst/glucoseiq/blob/v1.4.0/src/validators.ts))
- Test helpers module ([tests/test-helpers.ts](https://github.com/marklearst/glucoseiq/blob/v1.4.0/tests/test-helpers.ts)) with shared test utilities
- Enhanced TIR functions: [calculateEnhancedTIR()](https://github.com/marklearst/glucoseiq/blob/v1.4.0/src/tir-enhanced.ts) and [calculatePregnancyTIR()](https://github.com/marklearst/glucoseiq/blob/v1.4.0/src/tir-enhanced.ts)
- Added Enhanced TIR tests, bringing the suite to 205 tests with 100% coverage

### Changed
- Improved type safety by removing `any` types from type guards
- Enhanced constants with `as const` assertions for literal type inference
- Refactored GMI calculation functions to use named constants instead of magic numbers
- Extracted helper functions in TIR/MAGE for better maintainability
- Added `@example` JSDoc tags to conversion functions
- Improved documentation with `@category` tags

### Fixed
- Test coverage now 100% across all metrics (statements, branches, functions, lines)
- Coverage edge cases in MAGE and TIR calculations
- Removed unused error parameter in MAGE catch block

### Developer Experience
- Improved autocomplete with literal types
- Replaced inline formula values with named constants
- Added shared test helpers
- Added runnable documentation examples

## [1.3.1] - 2024-11-10
- Previous release

## [1.1.0] - 2024-03-20

### Architecture Changes

- Migrated from nested directory structure to flat organization
- Consolidated related functionality into one file per area
- Simplified import paths and reduced complexity

### File Consolidation

- Combined A1C calculations (`estimateA1C`, `estimateGMI`, `estimateEAG`) into `a1c.ts`
- Unified glucose unit conversions (`mgdlToMmol`, `mmolToMgdl`) into `conversions.ts`
- Merged glucose utilities (validation, formatting, status) into `glucose.ts`
- Consolidated time-in-range calculations into `tir.ts`
- Combined type guards into `guards.ts`
- Unified formatters into `formatters.ts`

### Testing Improvements

- Reorganized test files to mirror new structure
- Added type-definition tests
- Increased test coverage to 100% for all functional code
- Total test count increased from 34 to 63 tests

### Type System

- Centralized type definitions in `types.ts`
- Added validation tests for public type structures
- Improved type safety across the library

### Build & Configuration

- Updated build configuration for flat structure
- Optimized package exports configuration
- Maintained backward compatibility with existing APIs
