import React from 'react';

interface CardElementProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Card({ className = '', ...props }: CardElementProps) {
  return <div className={`rounded-xl bg-white border ${className}`} {...props} />;
}

export function CardHeader({ className = '', ...props }: CardElementProps) {
  return <div className={`px-4 py-3 ${className}`} {...props} />;
}

export function CardTitle({ className = '', ...props }: CardElementProps) {
  return <h3 className={`text-lg font-semibold text-slate-900 ${className}`} {...props} />;
}

export function CardDescription({ className = '', ...props }: CardElementProps) {
  return <p className={`text-sm text-slate-500 ${className}`} {...props} />;
}

export function CardContent({ className = '', ...props }: CardElementProps) {
  return <div className={`p-4 ${className}`} {...props} />;
}
