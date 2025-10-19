import type { AppProps } from 'next/app';
import '../styles/globals.css';
import React from 'react';
import Head from 'next/head';
import { ThemeProvider } from '../providers/ThemeProvider';
import ThemeToggle from '../components/ThemeToggle';
import { useRouter } from 'next/router';

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const showFloatingToggle = router.pathname !== '/workspace';

  return (
    <ThemeProvider>
      <>
        <Head>
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <Component {...pageProps} />
        {showFloatingToggle && <ThemeToggle />}
      </>
    </ThemeProvider>
  );
}
