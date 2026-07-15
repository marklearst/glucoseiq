import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONFIG_PATH = join(REPOSITORY_ROOT, 'commitlint.config.mjs')

function lintMessage(message) {
  return spawnSync('pnpm', ['lint:commits', '--color=false'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    input: `${message}\n`,
    shell: false,
  })
}

test('accepts the repository commit convention', () => {
  for (const message of [
    'docs: clarify glucose report wording',
    'fix(release): preserve the version fixture',
    'chore(release): version packages',
  ]) {
    const result = lintMessage(message)
    assert.equal(result.status, 0, result.stderr || result.stdout)
  }
})

test('rejects an invalid message inside a commit range', () => {
  const repository = mkdtempSync(join(tmpdir(), 'glucoseiq-commitlint-'))

  try {
    execFileSync('git', ['init', '--quiet'], { cwd: repository })
    execFileSync('git', ['config', 'user.email', 'test@glucoseiq.dev'], {
      cwd: repository,
    })
    execFileSync('git', ['config', 'user.name', 'GlucoseIQ Test'], {
      cwd: repository,
    })
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', 'chore: start fixture'], {
      cwd: repository,
    })
    const base = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim()
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', 'Apply remaining changes'], {
      cwd: repository,
    })
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', 'docs: finish fixture'], {
      cwd: repository,
    })

    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'commitlint',
        '--color=false',
        '--cwd',
        repository,
        '--config',
        CONFIG_PATH,
        '--from',
        base,
        '--to',
        'HEAD',
      ],
      { cwd: REPOSITORY_ROOT, encoding: 'utf8', shell: false },
    )

    assert.notEqual(result.status, 0)
    assert.match(result.stdout + result.stderr, /Apply remaining changes/u)
    assert.match(result.stdout + result.stderr, /\[type-empty\]/u)
  } finally {
    rmSync(repository, { force: true, recursive: true })
  }
})

test('rejects commit messages without a conventional type', () => {
  const result = lintMessage('Apply remaining changes')

  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /\[type-empty\]/u)
})
