import React from 'react';
import './globals.css';
import { ThemeProvider } from '../components/ThemeProvider';
import ThemeToggle from '../components/ThemeToggle';
import Link from 'next/link';

export const metadata = {
  title: 'SteadyAlpha Console',
  description: 'SteadyAlpha single-user trading copilot dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0 }}>
        <ThemeProvider>
          {/* Global top nav */}
          <header className="sticky top-0 z-50 bg-[var(--bg-card)] border-b border-[var(--border)] px-6 py-2 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <img src="/logo.png" alt="SteadyAlpha" className="h-6 w-auto" />
                <span className="font-bold text-[var(--text-primary)] tracking-tight text-sm">SteadyAlpha</span>
              </Link>
              <nav className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                <Link href="/" className="hover:text-[var(--text-primary)] transition-colors">Console</Link>
                <span>·</span>
                <Link href="/diagnostics" className="hover:text-[var(--text-primary)] transition-colors">Diagnostics</Link>
                <span>·</span>
                <Link href="/publication" className="hover:text-[var(--text-primary)] transition-colors text-amber-500 font-bold">Data Hub</Link>
              </nav>
            </div>
            <ThemeToggle />
          </header>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
