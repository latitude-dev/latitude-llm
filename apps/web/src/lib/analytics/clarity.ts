const CLARITY_PROJECT_ID: string | undefined = import.meta.env.VITE_LAT_CLARITY_PROJECT_ID

export const clarityHeadScripts = (): Array<{ children: string }> =>
  CLARITY_PROJECT_ID
    ? [
        {
          children: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_PROJECT_ID}");`,
        },
      ]
    : []
