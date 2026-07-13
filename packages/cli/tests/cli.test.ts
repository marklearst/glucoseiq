import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run, type CliIO } from '../src'

const UNSAFE_OUTPUT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

function makeIO(): CliIO & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = []
  const errLines: string[] = []
  return {
    outLines,
    errLines,
    out: (l) => outLines.push(l),
    err: (l) => errLines.push(l),
  }
}

function expectCleanFailure(argv: string[], message: RegExp): void {
  const io = makeIO()
  let code: number | undefined

  expect(() => {
    code = run(argv, io)
  }).not.toThrow()
  expect(code).toBe(1)
  expect(io.outLines).toEqual([])
  expect(io.errLines).toHaveLength(1)
  expect(io.errLines[0]).toMatch(message)
  expect(io.errLines[0]).not.toMatch(UNSAFE_OUTPUT)
  expect(io.errLines[0]).not.toMatch(/\bat\s+\S+\s+\(/)
}

let dir: string
let csvPath: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'giq-cli-'))
  csvPath = join(dir, 'data.csv')
  const rows = ['Timestamp,Glucose Value (mg/dL)']
  const base = Date.UTC(2024, 0, 1, 0, 0, 0)
  for (let i = 0; i < 288; i++) {
    const v = Math.round(110 + 30 * Math.sin(i / 12))
    rows.push(`${new Date(base + i * 5 * 60000).toISOString()},${v}`)
  }
  writeFileSync(csvPath, rows.join('\n'))
})

describe('glucoseiq CLI', () => {
  it('prints help with --help (exit 0) and with no args (exit 1)', () => {
    const io1 = makeIO()
    expect(run(['--help'], io1)).toBe(0)
    expect(io1.outLines.join('\n')).toContain('Usage:')
    const io2 = makeIO()
    expect(run([], io2)).toBe(1)

    const io3 = makeIO()
    expect(run(['report', '--help'], io3)).toBe(0)
    expect(io3.outLines.join('\n')).toContain('Usage:')
  })

  it('rejects unknown commands', () => {
    expectCleanFailure(['frobnicate', 'x.csv'], /Unknown command/)
  })

  it('sanitizes line breaks from argv before writing stderr', () => {
    expectCleanFailure(
      ['frobnicate\nforged output', 'x.csv'],
      /^Unknown command: frobnicate$/,
    )
    expectCleanFailure(
      ['report', join(dir, 'missing\rforged.csv')],
      /Cannot read file/,
    )
  })

  it('neutralizes terminal, format, and line controls in stderr', () => {
    expectCleanFailure(
      ['frobnicate\u0000\u001b[31m\u0085\u202e\u2028forged', 'x.csv'],
      /^Unknown command: frobnicate/,
    )
  })

  it('errors cleanly on a missing file', () => {
    expectCleanFailure(['report', join(dir, 'nope.csv')], /Cannot read file/)
  })

  it('errors cleanly on a bad column name', () => {
    expectCleanFailure(['report', csvPath, '--value-col', 'Missing'], /column not found/)
  })

  it('errors when the file has no valid readings', () => {
    const empty = join(dir, 'empty.csv')
    writeFileSync(empty, 'Timestamp,Glucose Value (mg/dL)\nbad,not-a-number')
    const io = makeIO()
    expect(run(['report', empty], io)).toBe(1)
    expect(io.errLines[0]).toMatch(/No valid readings/)
  })

  it('prints a human report with metrics and disclaimer', () => {
    const io = makeIO()
    expect(run(['report', csvPath], io)).toBe(0)
    const text = io.outLines.join('\n')
    expect(text).toContain('GlucoseIQ report')
    expect(text).toContain('Glucose IQ')
    expect(text).toContain('Time in range')
    expect(text).toContain('not medical advice')
  })

  it('flushes a human report with one output call', () => {
    const writes: string[] = []
    const io = makeIO()
    io.out = (text) => {
      writes.push(text)
      if (writes.length > 1) throw new Error('output sink rejected a second write')
    }

    expect(run(['report', csvPath], io)).toBe(0)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('GlucoseIQ report')
    expect(writes[0]).toContain('\nInformational only — not medical advice.')
    expect(io.errLines).toEqual([])
  })

  it('emits JSON with --json', () => {
    const io = makeIO()
    expect(run(['report', csvPath, '--json'], io)).toBe(0)
    const parsed = JSON.parse(io.outLines.join('\n'))
    expect(parsed.report.valid).toBe(true)
    expect(parsed.glucoseIQ.score).toBeGreaterThan(0)
  })

  it('accepts documented custom columns, delimiter, and mmol/L values', () => {
    const custom = join(dir, 'custom.csv')
    const rows = ['When;Glucose']
    const base = Date.UTC(2024, 0, 1, 0, 0, 0)
    for (let i = 0; i < 288; i++) {
      rows.push(`${new Date(base + i * 5 * 60000).toISOString()};6.1`)
    }
    writeFileSync(custom, rows.join('\n'))

    const io = makeIO()
    expect(run([
      'report',
      custom,
      '--timestamp-col',
      'When',
      '--value-col',
      'Glucose',
      '--unit',
      'mmol/L',
      '--delimiter',
      ';',
      '--json',
    ], io)).toBe(0)
    expect(JSON.parse(io.outLines.join('\n')).report.valid).toBe(true)
  })

  it('writes the AGP SVG with --agp-svg and honors --timezone', () => {
    const out = join(dir, 'agp.svg')
    const io = makeIO()
    expect(run(['report', csvPath, '--agp-svg', out, '--timezone', 'America/New_York'], io)).toBe(0)
    expect(existsSync(out)).toBe(true)
    expect(readFileSync(out, 'utf8')).toContain('<svg')
    expect(io.outLines.at(-1)).toContain('AGP chart written')

    // and without an explicit timezone (default UTC path)
    const out2 = join(dir, 'agp-utc.svg')
    const io2 = makeIO()
    expect(run(['report', csvPath, '--agp-svg', out2], io2)).toBe(0)
    expect(existsSync(out2)).toBe(true)
  })

  it('keeps JSON stdout as exactly one document when also writing an AGP SVG', () => {
    const out = join(dir, 'agp-json.svg')
    const io = makeIO()

    expect(run(['report', csvPath, '--json', '--agp-svg', out], io)).toBe(0)
    expect(() => JSON.parse(io.outLines.join('\n'))).not.toThrow()
    expect(io.outLines).toHaveLength(1)
    expect(existsSync(out)).toBe(true)
    expect(io.errLines).toEqual([])
  })

  it('escapes unsafe controls in the SVG path echoed on success', () => {
    const out = join(dir, 'agp\u001b[31m\u2028safe.svg')
    const io = makeIO()

    expect(run(['report', csvPath, '--agp-svg', out], io)).toBe(0)
    expect(existsSync(out)).toBe(true)
    const statusLine = io.outLines.join('\n').split('\n').at(-1)!
    expect(statusLine).toContain('AGP chart written to')
    expect(statusLine).not.toMatch(UNSAFE_OUTPUT)
    expect(statusLine).toContain('\\u{1b}')
    expect(statusLine).toContain('\\u{2028}')
  })

  const invalidSyntaxCases: Array<{
    label: string
    argv: () => string[]
    message: RegExp
  }> = [
    {
      label: 'unknown flags',
      argv: () => ['report', csvPath, '--unknown'],
      message: /unknown option.*--unknown/i,
    },
    ...[
      'timestamp-col',
      'value-col',
      'unit',
      'delimiter',
      'timezone',
      'agp-svg',
    ].map((flag) => ({
      label: `--${flag} without a value`,
      argv: () => ['report', csvPath, `--${flag}`],
      message: new RegExp(`${flag}.*value|value.*${flag}`, 'i'),
    })),
    {
      label: 'unsupported units',
      argv: () => ['report', csvPath, '--unit', 'other'],
      message: /unit.*mg\/dL.*mmol\/L/i,
    },
    {
      label: 'an empty delimiter',
      argv: () => ['report', csvPath, '--delimiter', ''],
      message: /delimiter.*one character/i,
    },
    {
      label: 'a multi-character delimiter',
      argv: () => ['report', csvPath, '--delimiter', '||'],
      message: /delimiter.*one character/i,
    },
    {
      label: 'a missing file positional',
      argv: () => ['report'],
      message: /expected.*report.*file/i,
    },
    {
      label: 'an extra positional',
      argv: () => ['report', csvPath, 'extra.csv'],
      message: /expected.*report.*file/i,
    },
    {
      label: 'an invalid IANA timezone',
      argv: () => ['report', csvPath, '--timezone', 'Mars/Olympus'],
      message: /time.?zone/i,
    },
  ]

  it.each(invalidSyntaxCases)('rejects $label without throwing', ({ argv, message }) => {
    expectCleanFailure(argv(), message)
  })

  it('normalizes multi-line parser diagnostics to one stderr line', () => {
    expectCleanFailure(
      ['report', csvPath, '--unit', '--json'],
      /unit/i,
    )
  })

  it.each([
    { thrown: 'plain failure', message: 'plain failure' },
    { thrown: 'plain\rfailure', message: 'plain' },
    { thrown: new Error(''), message: 'Unexpected CLI failure.' },
    {
      thrown: {
        toString: () => {
          throw new Error('hostile conversion')
        },
      },
      message: 'Unexpected CLI failure.',
    },
    {
      thrown: Object.defineProperty(new Error('hidden'), 'message', {
        get: () => {
          throw new Error('hostile message')
        },
      }),
      message: 'Unexpected CLI failure.',
    },
  ])('normalizes a thrown $message from injected output', ({ thrown, message }) => {
    const io = makeIO()
    io.out = () => {
      throw thrown
    }

    expect(run(['--help'], io)).toBe(1)
    expect(io.errLines).toEqual([message])
  })

  it('returns failure after one attempted stderr write when the error sink throws', () => {
    let attempts = 0
    let code: number | undefined
    const io = makeIO()
    io.err = () => {
      attempts++
      throw new Error('closed error sink')
    }

    expect(() => {
      code = run(['report', csvPath, '--unknown'], io)
    }).not.toThrow()
    expect(code).toBe(1)
    expect(attempts).toBe(1)
    expect(io.outLines).toEqual([])
  })

  it('reports an unwritable SVG without throwing or emitting partial stdout', () => {
    const directoryPath = join(dir, 'not-an-svg-file')
    mkdirSync(directoryPath, { recursive: true })

    expectCleanFailure(
      ['report', csvPath, '--agp-svg', directoryPath],
      /Cannot write AGP SVG/,
    )
    expectCleanFailure(
      ['report', csvPath, '--json', '--agp-svg', directoryPath],
      /Cannot write AGP SVG/,
    )
  })
})
