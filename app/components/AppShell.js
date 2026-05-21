"use client";

import { useState } from "react";
import Header from "./Header";
import Prefetcher from "./Prefetcher";

export default function AppShell({ children }) {
  return (
    <div className="flex h-screen bg-[#F8F9FA]">
      <Prefetcher />
      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-1.5 sm:p-2 pb-2">
          {children}
        </main>
      </div>
    </div>
  );
}
