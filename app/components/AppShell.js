"use client";

import { useState, createContext, useContext } from "react";
import Header from "./Header";
import Prefetcher from "./Prefetcher";

/* ── Page context ── */
const PageContext = createContext({ activePage: "thong-ke", setActivePage: () => {} });
export function usePageContext() { return useContext(PageContext); }

export default function AppShell({ children }) {
  const [activePage, setActivePage] = useState("thong-ke");

  return (
    <PageContext.Provider value={{ activePage, setActivePage }}>
      <div className="flex h-screen bg-[#F8F9FA]">
        <Prefetcher />

        {/* ── Main ── */}
        <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-1.5 sm:p-2 pb-2">
            {children}
          </main>
        </div>
      </div>
    </PageContext.Provider>
  );
}
