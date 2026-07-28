import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'
import type { JSX } from 'react'

interface HighlightedCodeProps {
  className?: string
  code: string
  label: string
  lang: 'json' | 'ts'
  viewportClassName?: string
}

export function HighlightedCode({
  className,
  code,
  label,
  lang,
  viewportClassName,
}: HighlightedCodeProps): JSX.Element {
  return (
    <ServerCodeBlock
      code={code}
      codeblock={{
        className,
        viewportProps: {
          'aria-label': label,
          className: viewportClassName,
        },
      }}
      lang={lang}
    />
  )
}
