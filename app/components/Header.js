"use client";

import { useState, useEffect } from "react";
import { Home, ChevronRight } from "lucide-react";
import { usePageContext } from "./AppShell";

const PAGE_NAMES = {
  "thong-ke": "Thống kê báo lỗi",
};

export default function Header() {
  const [time, setTime] = useState(null);
  const { activePage } = usePageContext();

  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = time
    ? time.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const formattedDate = time
    ? time.toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between h-10 px-4">
        {/* Trái: Breadcrumb */}
          <nav className="flex items-center gap-1 text-sm">
            <div className="flex items-center gap-1 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
              <Home size={14} />
              <span className="font-medium">Trang chủ</span>
            </div>
            <ChevronRight size={14} className="text-gray-300" />
            <span className="font-semibold text-gray-800">
              {PAGE_NAMES[activePage] || "Thống kê báo lỗi"}
            </span>
          </nav>

        {/* Phải: Đồng hồ + Ngày + Avatar */}
        <div className="flex items-center gap-3">
          {/* Đồng hồ */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="font-mono font-semibold text-gray-700 text-sm">
              🕐 {formattedTime}
            </span>
          </div>

          {/* Ngày */}
          <span className="hidden sm:block text-xs text-gray-400 border-l border-gray-200 pl-3">
            {formattedDate}
          </span>

          {/* Cờ Việt Nam */}
          <span className="text-xs px-1.5 py-0.5 bg-gray-50 rounded border border-gray-200 font-medium text-gray-500">
            VN
          </span>

          {/* Ảnh đại diện người dùng */}
          <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
              B
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
