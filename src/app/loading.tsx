import React from 'react';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6">
      <div className="h-5 w-32 animate-pulse rounded bg-line/70" />
      <div className="mt-4 h-[150px] animate-pulse rounded-[20px] bg-line/60" />
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-[76px] animate-pulse rounded-[18px] bg-line/50" />
        ))}
      </div>
      <div className="mt-3 h-[220px] animate-pulse rounded-[18px] bg-line/40" />
      <span className="sr-only">Loading DP Data Sub</span>
    </div>
  );
}
