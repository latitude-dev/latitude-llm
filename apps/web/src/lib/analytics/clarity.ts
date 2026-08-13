const CLARITY_PROJECT_ID: string | undefined = import.meta.env.VITE_LAT_CLARITY_PROJECT_ID

declare global {
  interface Window {
    clarity?: (...args: Array<unknown>) => void
  }
}

const claritySnippet = (projectId: string): string =>
  `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${projectId}");`

export const clarityHeadScripts = (): Array<{ children: string }> =>
  CLARITY_PROJECT_ID ? [{ children: claritySnippet(CLARITY_PROJECT_ID) }] : []

// For authenticated routes that render `head` outside the `_authenticated` guard.
// `loaderData` is undefined until the loader resolves, and an unknown session must
// count as excluded — recording a staff or impersonated session cannot be undone.
export const clarityHeadScriptsUnlessExcluded = (
  excludeFromAnalytics: boolean | undefined,
): Array<{ children: string }> => (excludeFromAnalytics === false ? clarityHeadScripts() : [])

// Clarity has no stop/disable API, so a session excluded from analytics must never
// load the tag at all — hence the client-side injection instead of a root `head`
// entry. Moving this to `__root.tsx` would silently record staff and impersonated
// support sessions.
export const loadClarity = (): void => {
  if (typeof window === "undefined" || !CLARITY_PROJECT_ID) return
  if (window.clarity) return
  const script = document.createElement("script")
  script.textContent = claritySnippet(CLARITY_PROJECT_ID)
  document.head.appendChild(script)
}
