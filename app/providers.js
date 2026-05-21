"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, App as AntApp } from "antd";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import viVN from "antd/locale/vi_VN";

export default function Providers({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,    // 5 min — server SWR handles freshness
            gcTime: 15 * 60 * 1000,       // 15 min — keep in memory longer
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AntdRegistry>
        <ConfigProvider
          locale={viVN}
          theme={{
            token: {
              colorPrimary: "#2563eb",
              borderRadius: 8,
              fontFamily: "var(--font-inter), Inter, -apple-system, sans-serif",
              fontSize: 13,
            },
          }}
        >
          <AntApp>{children}</AntApp>
        </ConfigProvider>
      </AntdRegistry>
    </QueryClientProvider>
  );
}
