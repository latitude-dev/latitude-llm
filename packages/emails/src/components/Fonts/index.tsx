import React from 'react'
import { Font, FontProps } from '@react-email/components'

const FALLBACKS = [
  'Arial',
  'Helvetica',
  'sans-serif',
] satisfies FontProps['fallbackFontFamily'][]

export function Fonts() {
  return (
    <>
      <Font
        fontFamily='Inter'
        fallbackFontFamily={FALLBACKS}
        webFont={{
          url: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2',
          format: 'woff2',
        }}
        fontWeight={400}
        fontStyle='normal'
      />
      <Font
        fontFamily='Inter'
        fallbackFontFamily={FALLBACKS}
        webFont={{
          url: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hiJ-Ek-_EeA.woff2',
          format: 'woff2',
        }}
        fontWeight={500}
        fontStyle='medium'
      />
      <Font
        fontFamily='Inter'
        fallbackFontFamily={FALLBACKS}
        webFont={{
          url: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiJ-Ek-_EeA.woff',
          format: 'woff2',
        }}
        fontWeight={700}
        fontStyle='bold'
      />
    </>
  )
}
