import React from 'react';

// ─── Glass Card ───────────────────────────────────────────────────────────────
// This is the universal glass surface used across all dashboard cards and panels.
// It uses inline styles for backdrop-filter to ensure maximum browser compatibility.

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 shadow-2xl transition-all duration-300
                  hover:border-white/20 hover:shadow-indigo-500/10 ${className}`}
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-4 ${className}`}>{children}</div>
  );
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-base font-semibold text-slate-100 tracking-tight ${className}`}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-sm text-slate-400 ${className}`}>{children}</p>
  );
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>{children}</div>
  );
}
