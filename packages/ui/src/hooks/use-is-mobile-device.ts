import { useState } from "react"
import { useMountEffect } from "./use-mount-effect.ts"

const MOBILE_UA_RE = /iPhone|iPad|iPod|Android|webOS|BlackBerry|Opera Mini|IEMobile|Windows Phone/i

function detectMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false
  if (MOBILE_UA_RE.test(navigator.userAgent)) return true
  // Some modern mobile browsers send desktop-like UA strings but still
  // expose touch capabilities via maxTouchPoints (e.g. iPadOS Safari).
  if (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent)) return true
  return false
}

/**
 * Returns `true` when the browser is running on a mobile device (phone or
 * tablet) based on the User-Agent string and touch capabilities.
 *
 * This intentionally does **not** use viewport width — a desktop user with a
 * narrow window (split screen, tiling WM) should never be flagged.
 */
export function useIsMobileDevice(): boolean {
  const [isMobile, setIsMobile] = useState(detectMobileDevice)

  useMountEffect(() => {
    setIsMobile(detectMobileDevice())
  })

  return isMobile
}
