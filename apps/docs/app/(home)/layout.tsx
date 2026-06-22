import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { baseOptions } from '@/lib/layout.shared'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import {
  createPageMetadata,
  SITE_DESCRIPTION,
  SITE_TITLE,
} from '@/lib/site-metadata'

export const metadata: Metadata = createPageMetadata({
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  pathname: '/',
  absoluteTitle: true,
})

export default function Layout({ children }: { children: ReactNode }) {
  return <HomeLayout {...baseOptions()}>{children}</HomeLayout>
}
