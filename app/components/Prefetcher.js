"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Prefetch all tables in a single request on app mount.
 * Uses the combined ?multi= endpoint for speed.
 */
async function fetchAllData() {
  const res = await fetch("/api/appsheet?multi=tong_hop_loi,so_giao_nhan,phieu_bao_loi,xac_nhan_ke_hoach");
  const json = await res.json();
  if (!json.ok) throw new Error("Prefetch failed");
  return {
    loi: json.results?.tong_hop_loi || [],
    sgn: json.results?.so_giao_nhan || [],
    pbl: json.results?.phieu_bao_loi || [],
    khht: json.results?.xac_nhan_ke_hoach || [],
  };
}

export default function Prefetcher() {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ["all_data"],
      queryFn: fetchAllData,
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient]);

  return null;
}
