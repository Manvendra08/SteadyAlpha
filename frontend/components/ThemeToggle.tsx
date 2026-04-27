'use client';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = theme === 'dark';
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border-theme bg-bg-card hover:opacity-80 transition-opacity text-sm font-medium text-text-primary"
      title="Toggle theme"
    >
      {isDark ? (
        <>
          <span>☀️</span><span className="hidden sm:inline">Light</span>
        </>
      ) : (
        <>
          <span>🌙</span><span className="hidden sm:inline">Dark</span>
        </>
      )}
    </button>
  );
}
