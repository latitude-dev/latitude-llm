// This script sends the document title and location to the parent window
// whenever the title changes or the URL changes.
// This is used by the main App for the inline documentation viewer.
;(function () {
  function notifyChange() {
    window.parent.postMessage(
      {
        type: 'docs.update',
        value: {
          title: document.title,
          route:
            window.location.pathname +
            window.location.search +
            window.location.hash,
        },
      },
      '*',
    )
  }

  // Watch <title> changes
  const titleEl = document.querySelector('title')
  if (titleEl) {
    const observer = new MutationObserver(notifyChange)
    observer.observe(titleEl, { childList: true })
  }

  // Patch history.pushState
  const originalPushState = history.pushState
  history.pushState = function (...args) {
    originalPushState.apply(this, args)
    notifyChange()
  }

  // Patch history.replaceState
  const originalReplaceState = history.replaceState
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args)
    notifyChange()
  }

  // Listen to back/forward navigation
  window.addEventListener('popstate', notifyChange)

  // Initial send
  notifyChange()
})()
