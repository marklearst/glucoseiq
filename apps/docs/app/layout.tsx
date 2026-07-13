import './global.css'
import { RootProvider } from 'fumadocs-ui/provider/next'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'GlucoseIQ — glucose intelligence on every screen',
    template: '%s | GlucoseIQ',
  },
  description:
    'TypeScript toolkit powered by a zero-runtime-dependency core for CGM analytics, percentile bands, Time-in-Range, variability, meal response, live trends, and optional SVG renderers.',
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="flex flex-col min-h-screen"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', ui-sans-serif, system-ui, sans-serif" }}
      >
        <RootProvider theme={{ defaultTheme: 'dark' }}>{children}</RootProvider>
      </body>
    </html>
  )
}
