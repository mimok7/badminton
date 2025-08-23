'use client';

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
}

export default function LoadingSpinner({ 
  size = 'md', 
  text = '로딩 중...', 
  fullScreen = false 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  const containerClasses = fullScreen 
    ? 'flex min-h-screen flex-col items-center justify-center p-0 bg-gray-50'
    : 'flex items-center justify-center p-4';

  return (
    <div className={containerClasses}>
      <div className={`animate-spin rounded-full border-t-2 border-b-2 border-blue-500 ${sizeClasses[size]}`} />
      {text && <p className="mt-4 text-gray-600">{text}</p>}
    </div>
  );
}
