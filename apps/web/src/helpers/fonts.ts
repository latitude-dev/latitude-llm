import localFont from 'next/font/local'

export const fontSans = localFont({
  src: [
    {
      path: '../assets/fonts/Inter-ExtraLight.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../assets/fonts/Inter-ExtraLightItalic.woff2',
      weight: '300',
      style: 'italic',
    },
    {
      path: '../assets/fonts/Inter-Light.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/Inter-LightItalic.woff2',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../assets/fonts/Inter-Regular.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../assets/fonts/Inter-Italic.woff2',
      weight: '500',
      style: 'italic',
    },
    {
      path: '../assets/fonts/Inter-Medium.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../assets/fonts/Inter-MediumItalic.woff2',
      weight: '600',
      style: 'italic',
    },
    {
      path: '../assets/fonts/Inter-SemiBold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../assets/fonts/Inter-SemiBoldItalic.woff2',
      weight: '700',
      style: 'italic',
    },
    {
      path: '../assets/fonts/Inter-Bold.woff2',
      weight: '800',
      style: 'normal',
    },
    {
      path: '../assets/fonts/Inter-BoldItalic.woff2',
      weight: '800',
      style: 'italic',
    },
    {
      path: '../assets/fonts/Inter-Black.woff2',
      weight: '900',
      style: 'normal',
    },
    {
      path: '../assets/fonts/Inter-BlackItalic.woff2',
      weight: '900',
      style: 'italic',
    },
  ],
  variable: '--font-sans',
})

export const fontMono = localFont({
  src: [
    {
      path: '../assets/fonts/JetBrainsMono-ExtraLight.ttf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-ExtraLightItalic.ttf',
      weight: '300',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Light.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-LightItalic.ttf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Regular.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Italic.ttf',
      weight: '500',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Medium.ttf',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-MediumItalic.ttf',
      weight: '600',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-SemiBold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-SemiBoldItalic.ttf',
      weight: '700',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Bold.ttf',
      weight: '800',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-BoldItalic.ttf',
      weight: '800',
      style: 'italic',
    },
  ],
  variable: '--font-mono',
})
