import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  formatA1C,
  isValidA1C,
  getA1CCategory,
  isA1CInTarget,
  a1cDelta,
  a1cTrend,
} from '../src/a1c'

type A1CCategory = 'normal' | 'prediabetes' | 'diabetes' | 'invalid'
type A1CThresholds = {
  normalMax?: number
  prediabetesMax?: number
}

function hostileScalar(): {
  value: object
  hooks: ReturnType<typeof vi.fn>[]
} {
  const toPrimitive = vi.fn(() => 6)
  const valueOf = vi.fn(() => 6)
  const toString = vi.fn(() => '6')

  return {
    value: {
      [Symbol.toPrimitive]: toPrimitive,
      valueOf,
      toString,
    },
    hooks: [toPrimitive, valueOf, toString],
  }
}

describe('A1C utilities', () => {
  it('formats A1C with percent', () => {
    expect(formatA1C(7)).toBe('7.0%')
  })
  it('validates plausible A1C values', () => {
    expect(isValidA1C(7)).toBe(true)
    expect(isValidA1C(0)).toBe(false)
    expect(isValidA1C(25)).toBe(false)
    expect(isValidA1C('7')).toBe(false)
  })
  describe('getA1CCategory', () => {
    it('preserves the exact public function type and return union', () => {
      expectTypeOf(getA1CCategory).toEqualTypeOf<
        (
          a1c: number,
          thresholds?: A1CThresholds
        ) => A1CCategory
      >()
    })

    it.each([
      [5.699999999999999, 'normal'],
      [5.7, 'prediabetes'],
      [6.499999999999999, 'prediabetes'],
      [6.5, 'diabetes'],
      [6.500000000000001, 'diabetes'],
    ] as const)('classifies the default boundary value %s as %s', (a1c, category) => {
      expect(getA1CCategory(a1c)).toBe(category)
    })

    it('returns invalid for an invalid A1C value', () => {
      expect(getA1CCategory(-1)).toBe('invalid')
    })

    it('keeps an explicit normal maximum inclusive when prediabetes is omitted', () => {
      expect(getA1CCategory(6, { normalMax: 6 })).toBe('normal')
    })

    it('keeps an explicit prediabetes maximum inclusive when normal is omitted', () => {
      expect(getA1CCategory(7, { prediabetesMax: 7 })).toBe('prediabetes')
    })

    it('keeps both explicit custom maxima inclusive', () => {
      expect(getA1CCategory(6, { normalMax: 6, prediabetesMax: 7 })).toBe('normal')
      expect(getA1CCategory(7, { normalMax: 6, prediabetesMax: 7 })).toBe('prediabetes')
      expect(getA1CCategory(7.5, { normalMax: 6, prediabetesMax: 7 })).toBe('diabetes')
    })

    it.each([
      [
        'undefined normal with custom prediabetes',
        5.7,
        { normalMax: undefined, prediabetesMax: 7 },
        'prediabetes',
      ],
      [
        'undefined normal with custom prediabetes below the boundary',
        5.6,
        { normalMax: undefined, prediabetesMax: 7 },
        'normal',
      ],
      [
        'custom normal with undefined prediabetes',
        6.5,
        { normalMax: 6, prediabetesMax: undefined },
        'diabetes',
      ],
      [
        'custom normal with undefined prediabetes below the boundary',
        6,
        { normalMax: 5.5, prediabetesMax: undefined },
        'prediabetes',
      ],
      [
        'runtime null normal with custom prediabetes',
        5.7,
        { normalMax: null, prediabetesMax: 7 },
        'prediabetes',
      ],
      [
        'runtime null normal with custom prediabetes below the boundary',
        5.6,
        { normalMax: null, prediabetesMax: 7 },
        'normal',
      ],
      [
        'custom normal with runtime null prediabetes',
        6.5,
        { normalMax: 6, prediabetesMax: null },
        'diabetes',
      ],
      [
        'custom normal with runtime null prediabetes below the boundary',
        6,
        { normalMax: 5.5, prediabetesMax: null },
        'prediabetes',
      ],
    ] as const)(
      'treats %s as an omitted default bound',
      (_label, a1c, thresholds, category) => {
        expect(
          getA1CCategory(a1c, thresholds as unknown as A1CThresholds)
        ).toBe(category)
      }
    )

    it('treats a runtime null thresholds object as fully omitted', () => {
      const thresholds = null as unknown as A1CThresholds

      expect(getA1CCategory(5.7, thresholds)).toBe('prediabetes')
      expect(getA1CCategory(6.5, thresholds)).toBe('diabetes')
    })

    it('preserves explicit zero and NaN comparison semantics', () => {
      expect(getA1CCategory(5.6, { normalMax: 0 })).toBe('prediabetes')
      expect(getA1CCategory(6, { prediabetesMax: Number.NaN })).toBe('diabetes')
    })

    it('preserves numeric-string and infinity comparison semantics', () => {
      expect(
        getA1CCategory(6, {
          normalMax: '6',
        } as unknown as A1CThresholds)
      ).toBe('normal')
      expect(
        getA1CCategory(7, {
          prediabetesMax: '7',
        } as unknown as A1CThresholds)
      ).toBe('prediabetes')
      expect(getA1CCategory(19.999, { normalMax: Infinity })).toBe('normal')
      expect(getA1CCategory(19.999, { prediabetesMax: Infinity })).toBe(
        'prediabetes'
      )
    })

    it('only coerces a Symbol threshold when its comparison is reached', () => {
      const symbol = Symbol('threshold') as unknown as number

      expect(getA1CCategory(5.6, { prediabetesMax: symbol })).toBe('normal')
      expect(() => getA1CCategory(6, { normalMax: symbol })).toThrow(TypeError)
      expect(() => getA1CCategory(6, { prediabetesMax: symbol })).toThrow(
        TypeError
      )
      expect(
        getA1CCategory(-1, {
          normalMax: symbol,
          prediabetesMax: symbol,
        })
      ).toBe('invalid')
    })

    it('reads each threshold once in normal-then-prediabetes order before an early match', () => {
      const accesses: string[] = []
      const normalMax = vi.fn(() => {
        accesses.push('normalMax')
        return 6
      })
      const prediabetesMax = vi.fn(() => {
        accesses.push('prediabetesMax')
        return 7
      })
      const thresholds = Object.defineProperties({}, {
        normalMax: { enumerable: true, get: normalMax },
        prediabetesMax: { enumerable: true, get: prediabetesMax },
      }) as A1CThresholds

      expect(getA1CCategory(5.5, thresholds)).toBe('normal')
      expect(accesses).toEqual(['normalMax', 'prediabetesMax'])
      expect(normalMax).toHaveBeenCalledTimes(1)
      expect(prediabetesMax).toHaveBeenCalledTimes(1)
    })

    it('eagerly reads thresholds but does not coerce an invalid A1C object', () => {
      const { value, hooks } = hostileScalar()
      const accesses: string[] = []
      const thresholds = Object.defineProperties({}, {
        normalMax: {
          get() {
            accesses.push('normalMax')
            return Symbol('normal')
          },
        },
        prediabetesMax: {
          get() {
            accesses.push('prediabetesMax')
            return Symbol('prediabetes')
          },
        },
      }) as unknown as A1CThresholds

      expect(
        getA1CCategory(value as unknown as number, thresholds)
      ).toBe('invalid')
      expect(accesses).toEqual(['normalMax', 'prediabetesMax'])
      for (const hook of hooks) expect(hook).not.toHaveBeenCalled()
    })
  })

  it('checks if A1C is in target', () => {
    expect(isA1CInTarget(6.8)).toBe(true)
    expect(isA1CInTarget(7.5)).toBe(false)
    expect(isA1CInTarget(6.8, [6, 7])).toBe(true)
  })

  it('checks if A1C is in target with custom min/max', () => {
    expect(isA1CInTarget(6.8, [6.5, 7.0], { min: 6.0, max: 7.5 })).toBe(true)
    expect(isA1CInTarget(5.9, [6.5, 7.0], { min: 6.0, max: 7.5 })).toBe(false)
    expect(isA1CInTarget(7.6, [6.5, 7.0], { min: 6.0, max: 7.5 })).toBe(false)
  })
  it('calculates A1C delta', () => {
    expect(a1cDelta(7, 6.5)).toBe(0.5)
    expect(() => a1cDelta(0, 6)).toThrow()
  })
  it('determines A1C trend', () => {
    expect(a1cTrend([6, 6.5, 7])).toBe('increasing')
    expect(a1cTrend([7, 6.5, 6])).toBe('decreasing')
    expect(a1cTrend([6, 6, 6])).toBe('stable')
    expect(a1cTrend([6])).toBe('insufficient data')
  })
})
