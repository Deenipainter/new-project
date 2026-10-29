import React from 'react';

import { DatabaseZap } from "lucide-react";

export function OutageNotice() {
  return (
    <div className="mb-4 rounded-xl border border-[#F3E2C0] bg-[#FBF6EA] px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <DatabaseZap className="mt-0.5 size-4 shrink-0 text-[#8A5B12]" />
        <div>
          <p className="text-[12.5px] font-semibold text-[#6B4A10]">Database temporarily unavailable</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#7A5A22]">
            The application database is not accepting connections, so accounts and wallets cannot be read
            right now. Nothing was lost — retry in a minute. If this persists, the database instance needs to
            be restarted from the services panel.
          </p>
        </div>
      </div>
    </div>
  );
}
