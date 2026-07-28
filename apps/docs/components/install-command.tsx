import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from 'fumadocs-ui/components/tabs'
import styles from './install-command.module.css'
import type { JSX } from 'react'

const INSTALLERS = [
  { label: 'npm', command: 'npm install @glucoseiq/core' },
  { label: 'pnpm', command: 'pnpm add @glucoseiq/core' },
  { label: 'yarn', command: 'yarn add @glucoseiq/core' },
  { label: 'bun', command: 'bun add @glucoseiq/core' },
] as const

export function InstallCommand(): JSX.Element {
  return (
    <Tabs className={styles.installer} defaultValue="npm">
      <TabsList aria-label="Package manager">
        {INSTALLERS.map(({ label }) => (
          <TabsTrigger key={label} value={label}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {INSTALLERS.map(({ command, label }) => (
        <TabsContent key={label} value={label}>
          <DynamicCodeBlock code={command} lang="bash" />
        </TabsContent>
      ))}
    </Tabs>
  )
}
