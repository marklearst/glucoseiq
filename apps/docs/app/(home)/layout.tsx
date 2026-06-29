import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { baseOptions } from '@/lib/layout.shared'
import type { CSSProperties, ReactNode } from 'react'
import type { Metadata } from 'next'
import {
  createPageMetadata,
  SITE_DESCRIPTION,
  SITE_TITLE,
} from '@/lib/site-metadata'
import styles from './home.module.css'

export const metadata: Metadata = createPageMetadata({
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  pathname: '/',
  absoluteTitle: true,
})

export default function Layout({ children }: { children: ReactNode }) {
  const homeTheme = {
    '--color-fd-background': '#0a0a0b',
    '--color-fd-foreground': '#f5f5f7',
    '--color-fd-muted-foreground': '#a1a1a6',
    '--color-fd-border': 'rgb(255 255 255 / 11%)',
    '--color-fd-card': '#0a0a0b',
    '--color-fd-accent': '#1c1c1e',
    '--color-fd-accent-foreground': '#f5f5f7',
    '--color-fd-primary': '#ff453a',
    '--color-fd-secondary': '#151517',
    '--color-fd-secondary-foreground': '#f5f5f7',
    background: '#0a0a0b',
    color: '#f5f5f7',
    colorScheme: 'dark',
  } as CSSProperties

  return (
    <HomeLayout
      {...baseOptions()}
      className={styles.homeLayout}
      style={homeTheme}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </HomeLayout>
  )
}
