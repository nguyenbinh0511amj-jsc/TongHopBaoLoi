"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Prefetch all tables in parallel on app mount.
 * Uses Promise.allSettled so one failure doesn't block others.
 */
const TABLES = [
  "so_giao_nhan",
  "tong_hop_loi",
];

// Map API table name → React Query key
const KEY_MAP = {
  so_giao_nhan: "so_giao_nhan",
  tong_hop_loi: "tong_hop_loi",
};

async function fetchTable(table) {
  const res = await fetch(`/api/appsheet?table=${table}`);
  const json = await res.json();
  if (json.error) throw new Error(json.detail || json.error);
  return json.rows || [];
}

export default function Prefetcher() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Fire all prefetches in parallel — server handles deduplication
    TABLES.forEach(table => {
      const key = KEY_MAP[table] || table;
      queryClient.prefetchQuery({
        queryKey: [key],
        queryFn: () => fetchTable(table),
        staleTime: 5 * 60 * 1000,
      });
    });
  }, [queryClient]);

  return null;
}
