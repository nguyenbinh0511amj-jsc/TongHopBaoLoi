"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Tải trước tất cả bảng trong một yêu cầu khi ứng dụng khởi động.
 * Sử dụng endpoint gộp ?multi= để tăng tốc.
 */
async function fetchAllData() {
  const res = await fetch("/api/appsheet?multi=tong_hop_loi,so_giao_nhan,xac_nhan_ke_hoach,nhan_vien,ke_hoach_pkt_dt,ke_hoach_pkt,Giao_Hang_PSX");
  const json = await res.json();
  if (!json.ok) throw new Error("Prefetch failed");
  return {
    loi: json.results?.tong_hop_loi || [],
    sgn: json.results?.so_giao_nhan || [],
    khht: json.results?.xac_nhan_ke_hoach || [],
    nhanVien: json.results?.nhan_vien || [],
    keHoachPktDt: json.results?.ke_hoach_pkt_dt || [],
    keHoachPkt: json.results?.ke_hoach_pkt || [],
    giaoHangPSX: json.results?.Giao_Hang_PSX || [],
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
