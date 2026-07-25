import { spawnSync } from 'node:child_process'

export const DEFAULT_PACKAGE_COMMAND_TIMEOUT_MS = 120_000

function formatCommand(command, args) {
  return [command, ...args].join(' ')
}

export function spawnPackageContractCommandSync(
  command,
  args,
  {
    cwd,
    encoding = 'utf8',
    env = process.env,
    timeoutMs = DEFAULT_PACKAGE_COMMAND_TIMEOUT_MS,
    spawnSyncImpl = spawnSync,
  } = {},
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('package-contract command timeout must be a positive integer in milliseconds')
  }

  const result = spawnSyncImpl(command, args, {
    cwd,
    encoding,
    env,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  })

  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(
      `${formatCommand(command, args)} timed out after ${timeoutMs} ms. Inspect the package registry, network, or child process before retrying.`,
      { cause: result.error },
    )
  }

  return result
}
