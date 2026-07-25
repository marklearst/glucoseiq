import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import styles from './install-command.module.css'
import type { JSX } from 'react'

const INSTALLERS = [
  { label: 'npm', command: 'npm install @glucoseiq/core' },
  { label: 'pnpm', command: 'pnpm add @glucoseiq/core' },
  { label: 'yarn', command: 'yarn add @glucoseiq/core' },
  { label: 'bun', command: 'bun add @glucoseiq/core' },
] as const
const INSTALLER_LABELS = INSTALLERS.map(({ label }) => label)

export function InstallCommand(): JSX.Element {
  return (
    <Tabs className={styles.installer} items={INSTALLER_LABELS}>
      {INSTALLERS.map(({ command, label }) => (
        <Tab key={label} value={label}>
          <DynamicCodeBlock code={command} lang="bash" />
        </Tab>
      ))}
    </Tabs>
  )
}
