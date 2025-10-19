import { Html, Head, Main, NextScript } from 'next/document'

const themeInitializer = `
(function() {
  try {
    var storageKey = 'udc-theme-preference';
    var classList = document.documentElement.classList;
    var storedTheme = localStorage.getItem(storageKey);
    var theme = (storedTheme === 'light' || storedTheme === 'dark')
      ? storedTheme
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    classList.remove('light', 'dark');
    classList.add(theme);
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    console.warn('Theme initialization failed', error);
  }
})();
`;

export default function Document() {
  return (
    <Html lang="en" suppressHydrationWarning>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}