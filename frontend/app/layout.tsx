import './globals.css';
import Link from 'next/link';
import { Providers } from '../components/Providers';

export const metadata = {
  title: 'SteadyAlpha Console',
  description: 'SteadyAlpha single-user trading copilot dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark')
                } else {
                  document.documentElement.classList.remove('dark')
                }
              } catch (_) {}
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0 }} className="bg-bg-primary text-text-secondary">
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
            {/* Theme Toggle disabled to prevent hydration errors in Turbopack */}
            <div className="w-8 h-8"></div>
          </header>
          <Providers>
            {children}
          </Providers>
      </body>
    </html>
  );
}
