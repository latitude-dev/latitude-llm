'use client'

import Script from 'next/script'
import { envClient } from '$/envClient'

export function GoogleTagManager() {
  const gtmId = envClient.NEXT_PUBLIC_GTM_ID

  if (!gtmId) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gtmId}`}
        strategy='afterInteractive'
      />
      <Script id='gtm-init' strategy='afterInteractive'>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gtmId}');
        `}
      </Script>
    </>
  )
}

