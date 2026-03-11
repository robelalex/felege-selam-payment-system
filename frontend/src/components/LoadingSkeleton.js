// src/components/LoadingSkeleton.js
import React from 'react';

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-12 bg-gray-200 rounded-lg w-3/4"></div>
      <div className="h-32 bg-gray-200 rounded-lg"></div>
      <div className="h-64 bg-gray-200 rounded-lg"></div>
    </div>
  );
}

export default LoadingSkeleton;