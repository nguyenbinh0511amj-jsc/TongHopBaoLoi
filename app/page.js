"use client";
import { useState, useMemo, useCallback, useDeferredValue, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataGrid } from "@mui/x-data-grid";
import { viVN } from "@mui/x-data-grid/locales";
import { Input, Button, Select, Space, Spin, Tag, InputNumber, DatePicker } from "antd";
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined, ClearOutlined,
  CaretRightOutlined, CaretDownOutlined,
  FilterOutlined, UnorderedListOutlined, AppstoreOutlined,
} from "@ant-design/icons";
import TheoDoiDonHang from "./components/TheoDoiDonHang";
import BaoCaoTinhTrang from "./components/BaoCaoTinhTrang";

import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/* ── Date helper: MM/DD/YYYY → DD/MM/YYYY ── */
function toVNDate(val) {
  if (!val) return "";
  const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return val;
  const [, a, b, y] = m;
  if (Number(a) > 12) return val;
  return `${b}/${a}/${y}`;
}

/* ── Parse MM/DD/YYYY to dayjs ── */
function parseDateMMDD(val) {
  if (!val) return null;
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, month, day, year] = m;
  return dayjs(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`);
}

/* ── API ── */
async function fetchThongKeLoi() {
  const res = await fetch("/api/appsheet?table=tong_hop_loi");
  const json = await res.json();
  if (json.error) throw new Error(json.detail || json.error);
  return json.rows || [];
}

async function fetchSoGiaoNhan() {
  const res = await fetch("/api/appsheet?table=so_giao_nhan");
  const json = await res.json();
  if (json.error) throw new Error(json.detail || json.error);
  return json.rows || [];
}

/* ── Force invalidate server cache + refetch ── */
async function invalidateAndFetch(table) {
  const res = await fetch(`/api/appsheet?table=${table}&invalidate=1`);
  const json = await res.json();
  if (json.error) throw new Error(json.detail || json.error);
  return json.rows || [];
}

/* ── Badge helpers ── */
function MaLoiBadge({ value }) {
  if (!value) return <span style={{ color: "#bfbfbf" }}>—</span>;
  const colors = {
    F1: "#dc2626", F2: "#ea580c", F3: "#d97706", F4: "#ca8a04",
    F5: "#65a30d", F6: "#0d9488", F7: "#2563eb", F8: "#7c3aed",
    F9: "#c026d3", F10: "#e11d48",
  };
  const code = value.match(/^F\d+/)?.[0] || "";
  const c = colors[code] || "#4b5563";
  return <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${c}15`, color: c, whiteSpace: "nowrap" }}>{value}</span>;
}

function NoiXuLyBadge({ value }) {
  if (!value) return <span style={{ color: "#bfbfbf" }}>—</span>;
  const bg = value === "PSX" ? "#fef3c7" : value === "XLBM" ? "#dbeafe" : "#f3f4f6";
  const color = value === "PSX" ? "#92400e" : value === "XLBM" ? "#1e40af" : "#4b5563";
  return <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color }}>{value}</span>;
}

function SoLanBadge({ value }) {
  const v = Number(value) || 0;
  let bg = "#f3f4f6", color = "#4b5563";
  if (v >= 5) { bg = "#fee2e2"; color = "#991b1b"; }
  else if (v >= 3) { bg = "#fef3c7"; color = "#92400e"; }
  return <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: bg, color, display: "inline-block", minWidth: 28, textAlign: "center" }}>{v}</span>;
}

function TrangThaiBadge({ value }) {
  if (!value) return <span style={{ color: "#bfbfbf" }}>—</span>;
  const vl = value.toLowerCase();
  let bg = "#f3f4f6", color = "#4b5563";
  if (vl.includes("hoàn thành") || vl.includes("hoan thanh")) { bg = "#d1fae5"; color = "#065f46"; }
  else if (vl.includes("chuyển") || vl.includes("chuyen")) { bg = "#e0f2fe"; color = "#0369a1"; }
  else if (vl.includes("tiềm năng") || vl.includes("tiem nang")) { bg = "#fef3c7"; color = "#92400e"; }
  else if (vl.includes("đang")) { bg = "#dbeafe"; color = "#1e40af"; }
  return <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: "nowrap" }}>{value}</span>;
}

/* ── Process: group by ten_chi_tiet, aggregate errors, lookup ngay_nhan ── */
function processData(thongKeLoi, soGiaoNhan) {
  // Build lookup: order_kd → ngay_nhan from so_giao_nhan (one-pass Map)
  const ngayNhanMap = new Map();
  for (let i = 0; i < soGiaoNhan.length; i++) {
    const r = soGiaoNhan[i];
    if (r.order_kd && r.ngay_nhan) {
      ngayNhanMap.set(r.order_kd, r.ngay_nhan);
    }
  }

  // Group by ten_chi_tiet — single pass
  const groups = new Map();
  for (let i = 0; i < thongKeLoi.length; i++) {
    const item = thongKeLoi[i];
    const key = (item.ten_chi_tiet || "").trim();
    if (!key) continue;

    // Lookup ngay_nhan early — skip entries without it
    const entryNgayNhan = item.order_kd ? (ngayNhanMap.get(item.order_kd) || "") : "";
    if (!entryNgayNhan) continue;

    let g = groups.get(key);
    if (!g) {
      g = { ten_chi_tiet: key, entries: [] };
      groups.set(key, g);
    }
    g.entries.push({ ...item, _ngay_nhan: entryNgayNhan });
  }

  // Build result array
  const result = [];
  let idx = 0;
  for (const [, g] of groups) {
    if (g.entries.length === 0) continue;

    const entries = g.entries;
    const entryLen = entries.length;

    // Aggregate in a single pass
    let totalSlLoi = 0, totalSlTra = 0;
    const orderKdSet = new Set();
    const maLoiSet = new Set();
    const noiXuLySet = new Set();
    const noiPhatSinhSet = new Set();
    const ngayNhans = [];
    const seenOrder = new Set();

    // Build search parts during same loop
    const searchParts = [g.ten_chi_tiet];

    for (let i = 0; i < entryLen; i++) {
      const e = entries[i];
      totalSlLoi += Number(e.sl_loi) || 0;
      totalSlTra += Number(e.sl_tra) || 0;
      if (e.order_kd) {
        orderKdSet.add(e.order_kd);
        if (e._ngay_nhan && !seenOrder.has(e.order_kd)) {
          seenOrder.add(e.order_kd);
          ngayNhans.push({ order_kd: e.order_kd, ngay_nhan: e._ngay_nhan });
        }
      }
      if (e.ma_loi) maLoiSet.add(e.ma_loi);
      if (e.noi_xu_ly_loi) noiXuLySet.add(e.noi_xu_ly_loi);
      if (e.noi_phat_sinh_loi) noiPhatSinhSet.add(e.noi_phat_sinh_loi);
    }

    // Sort entries by ngay_bao_loi descending
    entries.sort((a, b) => {
      const ta = a.ngay_bao_loi ? new Date(a.ngay_bao_loi).getTime() : 0;
      const tb = b.ngay_bao_loi ? new Date(b.ngay_bao_loi).getTime() : 0;
      return tb - ta;
    });

    const orderKds = [...orderKdSet];
    const maLois = [...maLoiSet];

    result.push({
      id: `grp_${idx++}`,
      ten_chi_tiet: g.ten_chi_tiet,
      so_lan_loi: entryLen,
      tong_sl_loi: totalSlLoi,
      tong_sl_tra: totalSlTra,
      loi_ton: totalSlLoi - totalSlTra,
      order_kds: orderKds,
      ma_lois: maLois,
      noi_xu_lys: [...noiXuLySet],
      noi_phat_sinhs: [...noiPhatSinhSet],
      ngay_nhans: ngayNhans,
      _allNgayNhanParsed: ngayNhans.map(n => parseDateMMDD(n.ngay_nhan)).filter(d => d && d.isValid()),
      entries,
      _searchText: `${g.ten_chi_tiet}\t${orderKds.join(" ")}\t${maLois.join(" ")}`.toLowerCase(),
    });
  }

  // Sort by so_lan_loi descending
  result.sort((a, b) => b.so_lan_loi - a.so_lan_loi);
  return result;
}

/* ════════════════════════════════════════ */
export default function TongHopThongKeLoiPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterMaLoi, setFilterMaLoi] = useState(null);
  const [filterTenChiTiet, setFilterTenChiTiet] = useState(null);
  const [filterNoiXuLy, setFilterNoiXuLy] = useState(null);
  const [filterNoiPhatSinh, setFilterNoiPhatSinh] = useState(null);
  const [minLanLoi, setMinLanLoi] = useState(3);
  const [ngayNhanFrom, setNgayNhanFrom] = useState(null);
  const [ngayNhanTo, setNgayNhanTo] = useState(null);
  const [ngayBaoLoiFrom, setNgayBaoLoiFrom] = useState(null);
  const [ngayBaoLoiTo, setNgayBaoLoiTo] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sortModel, setSortModel] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    try { return (typeof window !== 'undefined' && localStorage.getItem('activeTab')) || 'thongke'; }
    catch { return 'thongke'; }
  });

  useEffect(() => {
    try { localStorage.setItem('activeTab', activeTab); } catch {}
  }, [activeTab]);

  const deferredSearch = useDeferredValue(search);
  const deferredMaLoi = useDeferredValue(filterMaLoi);
  const deferredTenChiTiet = useDeferredValue(filterTenChiTiet);
  const deferredNoiXuLy = useDeferredValue(filterNoiXuLy);
  const deferredNoiPhatSinh = useDeferredValue(filterNoiPhatSinh);
  const deferredMinLan = useDeferredValue(minLanLoi);
  const deferredNgayNhanFrom = useDeferredValue(ngayNhanFrom);
  const deferredNgayNhanTo = useDeferredValue(ngayNhanTo);
  const deferredNgayBaoLoiFrom = useDeferredValue(ngayBaoLoiFrom);
  const deferredNgayBaoLoiTo = useDeferredValue(ngayBaoLoiTo);

  /* ── Fetch both tables — lower staleTime for faster updates ── */
  const { data: rawLoi = [], isLoading: loadingLoi, isRefetching: refetchingLoi } = useQuery({
    queryKey: ["tong_hop_loi"],
    queryFn: fetchThongKeLoi,
    staleTime: 30 * 1000,       // 30s — data stale nhanh hơn
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000, // 1 phút auto-refetch
    refetchOnWindowFocus: "always", // Luôn refetch khi quay lại tab
  });

  const { data: rawSGN = [], isLoading: loadingSGN } = useQuery({
    queryKey: ["so_giao_nhan"],
    queryFn: fetchSoGiaoNhan,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: "always",
  });

  const isLoading = loadingLoi || loadingSGN;

  /* ── Smart refresh: invalidate server cache + refetch ── */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Invalidate server cache + fetch fresh data in parallel
      const [loiData, sgnData] = await Promise.all([
        invalidateAndFetch("tong_hop_loi"),
        invalidateAndFetch("so_giao_nhan"),
      ]);
      // Update React Query cache directly — no extra fetch needed
      queryClient.setQueryData(["tong_hop_loi"], loiData);
      queryClient.setQueryData(["so_giao_nhan"], sgnData);
    } catch (err) {
      console.error("Refresh failed:", err);
      // Fallback: just invalidate React Query cache
      queryClient.invalidateQueries({ queryKey: ["tong_hop_loi"] });
      queryClient.invalidateQueries({ queryKey: ["so_giao_nhan"] });
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  /* ── Process data ── */
  const processed = useMemo(() => processData(rawLoi, rawSGN), [rawLoi, rawSGN]);

  /* ── Unique filter values ── */
  const uniqueMaLoi = useMemo(() => [...new Set(rawLoi.map(r => r.ma_loi).filter(Boolean))].sort(), [rawLoi]);
  const uniqueTenChiTiet = useMemo(() => [...new Set(processed.map(r => r.ten_chi_tiet).filter(Boolean))].sort(), [processed]);
  const uniqueNoiXuLy = useMemo(() => [...new Set(rawLoi.map(r => r.noi_xu_ly_loi).filter(Boolean))].sort(), [rawLoi]);
  const uniqueNoiPhatSinh = ["PSX", "PKT", "Phôi", "PKY"];

  /* ── Filter rows ── */
  const rows = useMemo(() => {
    let data = processed;

    // Min lần lỗi — dựa trên TỔNG số lần lỗi GỐC (trước khi lọc entry)
    data = data.filter(r => r.so_lan_loi >= (deferredMinLan || 1));

    // Filter tên chi tiết (group-level)
    if (deferredTenChiTiet) data = data.filter(r => r.ten_chi_tiet === deferredTenChiTiet);

    // Text search (group-level)
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      data = data.filter(r => r._searchText.includes(q));
    }

    // ── Entry-level filters: lọc sâu vào từng entry trong nhóm ──
    const hasEntryFilter = !!deferredMaLoi || !!deferredNoiXuLy || !!deferredNoiPhatSinh || !!deferredNgayNhanFrom || !!deferredNgayNhanTo || !!deferredNgayBaoLoiFrom || !!deferredNgayBaoLoiTo;
    if (hasEntryFilter) {
      const isNgayNhanInRange = (dateStr) => {
        const d = parseDateMMDD(dateStr);
        if (!d || !d.isValid()) return false;
        if (deferredNgayNhanFrom && d.isBefore(deferredNgayNhanFrom, "day")) return false;
        if (deferredNgayNhanTo && d.isAfter(deferredNgayNhanTo, "day")) return false;
        return true;
      };
      const isNgayBaoLoiInRange = (dateStr) => {
        const d = parseDateMMDD(dateStr);
        if (!d || !d.isValid()) return false;
        if (deferredNgayBaoLoiFrom && d.isBefore(deferredNgayBaoLoiFrom, "day")) return false;
        if (deferredNgayBaoLoiTo && d.isAfter(deferredNgayBaoLoiTo, "day")) return false;
        return true;
      };

      data = data.map(r => {
        let filteredEntries = r.entries;

        // Lọc theo mã lỗi
        if (deferredMaLoi) {
          filteredEntries = filteredEntries.filter(e => e.ma_loi === deferredMaLoi);
        }

        // Lọc theo nơi xử lý
        if (deferredNoiXuLy) {
          filteredEntries = filteredEntries.filter(e => e.noi_xu_ly_loi === deferredNoiXuLy);
        }

        // Lọc theo nơi phát sinh
        if (deferredNoiPhatSinh) {
          filteredEntries = filteredEntries.filter(e => e.noi_phat_sinh_loi === deferredNoiPhatSinh);
        }

        // Lọc theo ngày nhận hàng
        if (deferredNgayNhanFrom || deferredNgayNhanTo) {
          filteredEntries = filteredEntries.filter(e => e._ngay_nhan && isNgayNhanInRange(e._ngay_nhan));
        }

        // Lọc theo ngày báo lỗi
        if (deferredNgayBaoLoiFrom || deferredNgayBaoLoiTo) {
          filteredEntries = filteredEntries.filter(e => e.ngay_bao_loi && isNgayBaoLoiInRange(e.ngay_bao_loi));
        }

        if (!filteredEntries.length) return null;

        // Rebuild aggregates từ entries đã lọc
        const ngayNhans = [];
        const seen = new Set();
        filteredEntries.forEach(e => {
          if (e.order_kd && e._ngay_nhan && !seen.has(e.order_kd)) {
            seen.add(e.order_kd);
            ngayNhans.push({ order_kd: e.order_kd, ngay_nhan: e._ngay_nhan });
          }
        });

        return {
          ...r,
          entries: filteredEntries,
          so_lan_loi: filteredEntries.length,
          // Giữ lại so_lan_loi_goc để hiển thị
          _so_lan_loi_goc: r.so_lan_loi,
          tong_sl_loi: filteredEntries.reduce((s, e) => s + (Number(e.sl_loi) || 0), 0),
          tong_sl_tra: filteredEntries.reduce((s, e) => s + (Number(e.sl_tra) || 0), 0),
          loi_ton: filteredEntries.reduce((s, e) => s + (Number(e.sl_loi) || 0), 0) - filteredEntries.reduce((s, e) => s + (Number(e.sl_tra) || 0), 0),
          order_kds: [...new Set(filteredEntries.map(e => e.order_kd).filter(Boolean))],
          ma_lois: [...new Set(filteredEntries.map(e => e.ma_loi).filter(Boolean))],
          noi_xu_lys: [...new Set(filteredEntries.map(e => e.noi_xu_ly_loi).filter(Boolean))],
          ngay_nhans: ngayNhans,
        };
      }).filter(Boolean);
    }

    return data;
  }, [processed, deferredSearch, deferredMaLoi, deferredTenChiTiet, deferredNoiXuLy, deferredNoiPhatSinh, deferredMinLan, deferredNgayNhanFrom, deferredNgayNhanTo, deferredNgayBaoLoiFrom, deferredNgayBaoLoiTo]);

  /* ── Stats ── */
  const stats = useMemo(() => ({
    chiTiet: rows.length,
    tongLanLoi: rows.reduce((s, r) => s + r.so_lan_loi, 0),
    tongSlLoi: rows.reduce((s, r) => s + r.tong_sl_loi, 0),
    loiTon: rows.reduce((s, r) => s + r.loi_ton, 0),
  }), [rows]);

  const hasActiveFilter = !!filterMaLoi || !!filterTenChiTiet || !!filterNoiXuLy || !!filterNoiPhatSinh || !!ngayNhanFrom || !!ngayNhanTo || !!ngayBaoLoiFrom || !!ngayBaoLoiTo;
  const isFiltering = deferredSearch !== search || deferredMaLoi !== filterMaLoi || deferredTenChiTiet !== filterTenChiTiet || deferredNoiXuLy !== filterNoiXuLy || deferredNoiPhatSinh !== filterNoiPhatSinh || deferredMinLan !== minLanLoi || deferredNgayNhanFrom !== ngayNhanFrom || deferredNgayNhanTo !== ngayNhanTo || deferredNgayBaoLoiFrom !== ngayBaoLoiFrom || deferredNgayBaoLoiTo !== ngayBaoLoiTo;

  /* ── Toggle expand ── */
  const toggleExpand = useCallback((id) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /* ── Build flat rows (parent + expanded children) ── */
  const flatRows = useMemo(() => {
    // Sort parents theo sortModel
    let sortedParents = [...rows];
    if (sortModel.length > 0) {
      const { field, sort } = sortModel[0];
      sortedParents.sort((a, b) => {
        let va = a[field];
        let vb = b[field];
        // Handle arrays (ma_lois, order_kds, etc.)
        if (Array.isArray(va)) va = va.join(", ");
        if (Array.isArray(vb)) vb = vb.join(", ");
        // Handle numbers
        if (typeof va === "number" && typeof vb === "number") {
          return sort === "asc" ? va - vb : vb - va;
        }
        // Handle strings
        va = String(va || "").toLowerCase();
        vb = String(vb || "").toLowerCase();
        return sort === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }

    const result = [];
    sortedParents.forEach(row => {
      result.push({ ...row, _type: "parent" });
      if (expandedRows.has(row.id)) {
        row.entries.forEach((entry, i) => {
          result.push({
            id: `${row.id}_child_${i}`,
            _type: "child",
            _parentId: row.id,
            order_kd: entry.order_kd || "",
            ten_chi_tiet: entry.ten_chi_tiet || "",
            ma_loi: entry.ma_loi || "",
            noi_dung_loi: entry.noi_dung_loi || "",
            sl_loi: entry.sl_loi || "",
            sl_tra: entry.sl_tra || "",
            ngay_bao_loi: entry.ngay_bao_loi || "",
            ngay_tra_loi: entry.ngay_tra_loi || "",
            noi_xu_ly_loi: entry.noi_xu_ly_loi || "",
            noi_phat_sinh_loi: entry.noi_phat_sinh_loi || "",
            ho_va_ten: entry.ho_va_ten || "",
            trang_thai: entry.trang_thai || "",
            ngay_nhan: entry._ngay_nhan || "",
          });
        });
      }
    });
    return result;
  }, [rows, expandedRows, sortModel]);

  /* ── Excel Export ── */
  const exportExcel = useCallback(() => {
    import("xlsx").then(XLSX => {
      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Tổng hợp (grouped summary) ──
      const summaryHeaders = ["STT", "Tên chi tiết", "Số lần lỗi", "Tổng SL lỗi", "SL trả", "Lỗi tồn", "Các Order KD", "Các mã lỗi", "Nơi xử lý", "Ngày nhận hàng"];
      const summaryData = rows.map((r, i) => [
        i + 1,
        r.ten_chi_tiet,
        r.so_lan_loi,
        r.tong_sl_loi,
        r.tong_sl_tra,
        r.loi_ton,
        r.order_kds.join(", "),
        r.ma_lois.join(", "),
        r.noi_xu_lys.join(", "),
        r.ngay_nhans.map(n => `${n.order_kd}: ${toVNDate(n.ngay_nhan)}`).join("; "),
      ]);
      const ws1 = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryData]);
      // Auto width
      ws1["!cols"] = summaryHeaders.map((h, i) => ({
        wch: Math.max(h.length, ...summaryData.map(r => String(r[i] || "").length).slice(0, 50), 8),
      }));
      XLSX.utils.book_append_sheet(wb, ws1, "Tổng hợp");

      // ── Sheet 2: Chi tiết (all individual entries) ──
      const detailHeaders = ["STT", "Tên chi tiết", "Order KD", "Mã lỗi", "Nội dung lỗi", "SL lỗi", "SL trả", "Ngày báo lỗi", "Ngày trả lỗi", "Nơi xử lý", "Nơi phát sinh", "Ngày nhận hàng", "Trạng thái"];
      const detailData = [];
      let stt = 0;
      rows.forEach(r => {
        r.entries.forEach(e => {
          stt++;
          detailData.push([
            stt,
            r.ten_chi_tiet,
            e.order_kd || "",
            e.ma_loi || "",
            e.noi_dung_loi || "",
            Number(e.sl_loi) || 0,
            Number(e.sl_tra) || 0,
            toVNDate(e.ngay_bao_loi) || "",
            toVNDate(e.ngay_tra_loi) || "",
            e.noi_xu_ly_loi || "",
            e.noi_phat_sinh_loi || "",
            toVNDate(e._ngay_nhan) || "",
            e.trang_thai || "",
          ]);
        });
      });
      const ws2 = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailData]);
      ws2["!cols"] = detailHeaders.map((h, i) => ({
        wch: Math.max(h.length, ...detailData.slice(0, 50).map(r => String(r[i] || "").length), 8),
      }));
      XLSX.utils.book_append_sheet(wb, ws2, "Chi tiết");

      // Download
      XLSX.writeFile(wb, `Thong_ke_bao_loi_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  }, [rows]);

  /* ── Clear all filters ── */
  const clearAllFilters = useCallback(() => {
    setSearch("");
    setFilterMaLoi(null);
    setFilterTenChiTiet(null);
    setFilterNoiXuLy(null);
    setFilterNoiPhatSinh(null);
    setNgayNhanFrom(null);
    setNgayNhanTo(null);
    setNgayBaoLoiFrom(null);
    setNgayBaoLoiTo(null);
  }, []);

  /* ── Columns ── */
  const columns = useMemo(() => [
    {
      field: "expand", headerName: "", width: 40, sortable: false, filterable: false,
      renderCell: (p) => {
        if (p.row._type !== "parent") return null;
        const isExpanded = expandedRows.has(p.row.id);
        return (
          <span
            onClick={(e) => { e.stopPropagation(); toggleExpand(p.row.id); }}
            style={{ cursor: "pointer", fontSize: 14, color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}
          >
            {isExpanded ? <CaretDownOutlined style={{ color: "#2563eb" }} /> : <CaretRightOutlined />}
          </span>
        );
      },
    },
    {
      field: "ten_chi_tiet", headerName: "Tên chi tiết", minWidth: 200, flex: 1,
      renderCell: (p) => {
        if (p.row._type === "child") {
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 8 }}>
              <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{p.row.order_kd}</span>
            </div>
          );
        }
        return (
          <span style={{ color: "#1e40af", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.value || "—"}</span>
        );
      },
    },
    {
      field: "so_lan_loi", headerName: "Số lần lỗi", minWidth: 120, width: 120, type: "number", align: "center", headerAlign: "center",
      renderCell: (p) => {
        if (p.row._type === "child") return null;
        return <SoLanBadge value={p.value} />;
      },
    },
    {
      field: "tong_sl_loi", headerName: "Tổng SL lỗi", minWidth: 130, width: 130, type: "number", align: "center", headerAlign: "center",
      renderCell: (p) => {
        if (p.row._type === "child") {
          const v = Number(p.row.sl_loi) || 0;
          return <span style={{ fontSize: 12, fontWeight: 500, color: v > 0 ? "#dc2626" : "#bfbfbf" }}>{v || "—"}</span>;
        }
        const v = p.value || 0;
        return <span style={{ fontWeight: 700, color: v > 0 ? "#dc2626" : "#bfbfbf" }}>{v || "—"}</span>;
      },
    },
    {
      field: "tong_sl_tra", headerName: "SL trả", minWidth: 100, width: 100, type: "number", align: "center", headerAlign: "center",
      renderCell: (p) => {
        if (p.row._type === "child") {
          const v = Number(p.row.sl_tra) || 0;
          return <span style={{ fontSize: 12, color: v > 0 ? "#059669" : "#bfbfbf" }}>{v || "—"}</span>;
        }
        const v = p.value || 0;
        return <span style={{ fontWeight: 600, color: v > 0 ? "#059669" : "#bfbfbf" }}>{v || "—"}</span>;
      },
    },
    {
      field: "loi_ton", headerName: "Lỗi tồn", minWidth: 120, width: 120, type: "number", align: "center", headerAlign: "center",
      renderCell: (p) => {
        if (p.row._type === "child") return null;
        const v = p.value || 0;
        return <span style={{ fontWeight: 700, color: v > 0 ? "#dc2626" : v < 0 ? "#059669" : "#bfbfbf" }}>{v}</span>;
      },
    },
    {
      field: "ma_lois", headerName: "Mã lỗi", minWidth: 180, flex: 1,
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") {
          return <MaLoiBadge value={p.row.ma_loi} />;
        }
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 3, flexWrap: "nowrap", alignItems: "center", overflow: "hidden" }}>
            {arr.map(m => <MaLoiBadge key={m} value={m} />)}
          </div>
        );
      },
    },
    {
      field: "order_kds", headerName: "Các Order KD", minWidth: 180, flex: 1,
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") {
          return <span style={{ fontWeight: 600, fontSize: 12, color: "#1f2937" }}>{p.row.order_kd}</span>;
        }
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 3, flexWrap: "nowrap", alignItems: "center", overflow: "hidden" }}>
            {arr.map(o => (
              <span key={o} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: "#f3f4f6", color: "#374151", whiteSpace: "nowrap" }}>{o}</span>
            ))}
          </div>
        );
      },
    },
    {
      field: "noi_xu_lys", headerName: "Nơi xử lý", minWidth: 130, width: 130, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") return <NoiXuLyBadge value={p.row.noi_xu_ly_loi} />;
        const arr = p.value || [];
        return (
          <div style={{ display: "flex", gap: 3, flexWrap: "nowrap", justifyContent: "center", overflow: "hidden" }}>
            {arr.map(v => <NoiXuLyBadge key={v} value={v} />)}
          </div>
        );
      },
    },
    {
      field: "noi_phat_sinhs", headerName: "Nơi phát sinh", minWidth: 140, width: 140, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") return <NoiXuLyBadge value={p.row.noi_phat_sinh_loi} />;
        const arr = p.value || [];
        return (
          <div style={{ display: "flex", gap: 3, flexWrap: "nowrap", justifyContent: "center", overflow: "hidden" }}>
            {arr.map(v => <NoiXuLyBadge key={v} value={v} />)}
          </div>
        );
      },
    },
    {
      field: "ngay_nhans", headerName: "Ngày nhận hàng", minWidth: 180, width: 180,
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") {
          return <span style={{ fontSize: 12, color: "#374151" }}>{toVNDate(p.row.ngay_nhan) || "—"}</span>;
        }
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        const text = arr.map(n => `${n.order_kd}: ${toVNDate(n.ngay_nhan)}`).join("; ");
        return (
          <span style={{ fontSize: 11, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }} title={text}>
            {text}
          </span>
        );
      },
    },
    {
      field: "_childNgayBaoLoi", headerName: "Ngày báo lỗi", minWidth: 140, width: 140,
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") return <span style={{ fontSize: 12 }}>{toVNDate(p.row.ngay_bao_loi) || "—"}</span>;
        return null;
      },
    },
    {
      field: "_childNoiDungLoi", headerName: "Nội dung lỗi", minWidth: 180, flex: 1,
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") return <span style={{ fontSize: 12 }} title={p.row.noi_dung_loi}>{p.row.noi_dung_loi || "—"}</span>;
        return null;
      },
    },
    {
      field: "_childTrangThai", headerName: "Trạng thái", minWidth: 140, width: 140,
      sortable: false,
      renderCell: (p) => {
        if (p.row._type !== "child") return null;
        return <TrangThaiBadge value={p.row.trang_thai} />;
      },
    },
  ], [expandedRows, toggleExpand]);

  /* ════════════════════ RENDER ════════════════════ */
  const activeFilterCount = [filterMaLoi, filterTenChiTiet, filterNoiXuLy, filterNoiPhatSinh, ngayNhanFrom, ngayNhanTo].filter(Boolean).length;

  const mainTabs = [
    { key: "thongke", label: "Thống kê báo lỗi", color: "#1e40af", border: "#2563eb", bg: "#eff6ff" },
    { key: "theodoi", label: "Theo dõi đơn hàng cần báo lỗi", color: "#b45309", border: "#d97706", bg: "#fffbeb" },
    { key: "baocao", label: "Báo cáo tình trạng", color: "#7c3aed", border: "#8b5cf6", bg: "#f5f3ff" },
  ];

  return (
    <div className="page-container" style={{ maxWidth: "100%", height: "calc(100vh - 48px)", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Tab bar */}
      <div className="tab-bar" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", background: "#fff", borderBottom: "1px solid #e5e7eb",
      }}>
        <div className="tab-list" style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {mainTabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                className="tab-btn"
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? tab.color : "#9ca3af",
                  background: isActive ? tab.bg : "transparent",
                  border: "none",
                  borderBottom: isActive ? `3px solid ${tab.border}` : "3px solid transparent",
                  borderRadius: isActive ? "6px 6px 0 0" : 0,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            );
          })}
          {(isFiltering || refetchingLoi || isRefreshing) && <Spin size="small" style={{ marginLeft: 12 }} />}
        </div>
        <Button size="small" icon={<ReloadOutlined spin={isRefreshing || refetchingLoi} />}
          onClick={handleRefresh}
          title="Làm mới dữ liệu từ server (bỏ cache)" />
      </div>

      {/* Content area */}
      {activeTab === "thongke" ? (
        <>
          {/* Stats + Export for tab 1 */}
          <div className="stats-row" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 16px", background: "#fff", borderBottom: "1px solid #f0f0f0",
          }}>
            <div style={{ display: "flex", gap: 16 }}>
              <StatPill label="Chi tiết" value={isLoading ? "…" : stats.chiTiet} color="#2563eb" />
              <StatPill label="Tổng lần" value={isLoading ? "…" : stats.tongLanLoi} color="#d97706" />
              <StatPill label="SL lỗi" value={isLoading ? "…" : stats.tongSlLoi.toLocaleString()} color="#dc2626" />
              <StatPill label="Lỗi tồn" value={isLoading ? "…" : stats.loiTon.toLocaleString()} color="#7c3aed" />
            </div>
            <Button size="small" icon={<DownloadOutlined />} onClick={exportExcel} title="Xuất Excel">Xuất Excel</Button>
          </div>

          {/* Filter toolbar for tab 1 */}
          <div className="filter-toolbar" style={{
            padding: "6px 16px", background: "#fff", borderBottom: "1px solid #f0f0f0",
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          }}>
            <Input
              placeholder="Tìm theo tên chi tiết, order..."
              size="small" allowClear value={search}
              prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 240, borderRadius: 6 }}
            />
            <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
            <Select placeholder="Mã lỗi" allowClear value={filterMaLoi} size="small"
              onChange={v => setFilterMaLoi(v || null)} style={{ minWidth: 150 }}
              showSearch optionFilterProp="label"
              options={uniqueMaLoi.map(v => ({ label: v, value: v }))} />
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>≥ lần:</span>
              <InputNumber size="small" min={1} max={99} value={minLanLoi}
                onChange={v => setMinLanLoi(v || 1)} style={{ width: 55 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>Nhận từ:</span>
              <DatePicker size="small" value={ngayNhanFrom} onChange={v => setNgayNhanFrom(v)}
                format="DD/MM/YYYY" placeholder="Từ ngày" style={{ width: 115 }} allowClear />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>→</span>
              <DatePicker size="small" value={ngayNhanTo} onChange={v => setNgayNhanTo(v)}
                format="DD/MM/YYYY" placeholder="Đến ngày" style={{ width: 115 }} allowClear />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>Báo lỗi từ:</span>
              <DatePicker size="small" value={ngayBaoLoiFrom} onChange={v => setNgayBaoLoiFrom(v)}
                format="DD/MM/YYYY" placeholder="Từ ngày" style={{ width: 115 }} allowClear />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>→</span>
              <DatePicker size="small" value={ngayBaoLoiTo} onChange={v => setNgayBaoLoiTo(v)}
                format="DD/MM/YYYY" placeholder="Đến ngày" style={{ width: 115 }} allowClear />
            </div>
            {hasActiveFilter && (
              <Button type="link" danger size="small" icon={<ClearOutlined />}
                onClick={clearAllFilters}
                style={{ padding: "0 6px", fontSize: 12 }}>Xóa lọc</Button>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Tổng <b style={{ color: "#111827" }}>{rows.length}</b> bản ghi
            </span>
          </div>

          {/* DataGrid - Thống kê báo lỗi */}
          <div className="datagrid-wrapper" style={{
            flex: 1, minHeight: 0, width: "100%",
            opacity: isFiltering ? 0.6 : 1,
            transition: "opacity 0.15s",
            background: "#fff",
          }}>
            <DataGrid
              rows={flatRows}
              columns={columns}
              getRowId={(row) => row.id}
              loading={isLoading}
              localeText={viVN.components.MuiDataGrid.defaultProps.localeText}
              disableColumnMenu
              disableColumnReorder
              pageSizeOptions={[50, 100, 200, 500]}
              initialState={{
                pagination: { paginationModel: { pageSize: 100 } },
              }}
              disableRowSelectionOnClick
              sortingMode="server"
              sortModel={sortModel}
              onSortModelChange={(model) => setSortModel(model)}
              disableMultipleColumnsSorting
              density="compact"
              getRowClassName={(params) => {
                if (params.row._type === "child") return "child-row";
                return "";
              }}
              sx={{
                border: "none", fontSize: 13,
                fontFamily: "var(--font-inter), Inter, sans-serif",
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: "#ffffff",
                  borderBottom: "1px solid #e5e7eb",
                  minHeight: "36px !important",
                  maxHeight: "36px !important",
                },
                "& .MuiDataGrid-columnHeader": {
                  padding: "0 8px",
                  "&:hover": { backgroundColor: "#f9fafb" },
                },
                "& .MuiDataGrid-columnHeaderTitle": {
                  fontWeight: 500,
                  fontSize: 13,
                  color: "#111827",
                  textTransform: "none",
                  letterSpacing: "0.01em",
                  overflow: "visible",
                  textOverflow: "unset",
                  whiteSpace: "nowrap",
                },
                "& .MuiDataGrid-iconButtonContainer": {
                  visibility: "visible !important",
                  width: "auto !important",
                  marginLeft: 2,
                },
                "& .MuiDataGrid-sortIcon": {
                  opacity: "1 !important",
                  color: "#111827",
                  fontSize: 16,
                },
                "& .MuiDataGrid-menuIcon": {
                  visibility: "visible !important",
                  width: "auto !important",
                },
                "& .MuiDataGrid-columnSeparator": {
                  display: "none",
                },
                "& .MuiDataGrid-row": {
                  borderBottom: "1px solid #f0f0f0",
                  "&:hover": { backgroundColor: "#f8f9ff" },
                },
                "& .MuiDataGrid-row.child-row": {
                  backgroundColor: "#fafbfc",
                  borderLeft: "3px solid #e0e7ff",
                  "&:hover": { backgroundColor: "#eef2ff" },
                },
                "& .MuiDataGrid-cell": {
                  borderBottom: "none",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 8px",
                },
                "& .MuiDataGrid-footerContainer": {
                  borderTop: "1px solid #e5e7eb",
                  minHeight: 38,
                  backgroundColor: "#fff",
                },
                "& .MuiTablePagination-root": {
                  fontSize: 13,
                },
                "& .MuiTablePagination-displayedRows": {
                  fontSize: 13,
                  color: "#6b7280",
                },
              }}
            />
          </div>
        </>
      ) : activeTab === "theodoi" ? (
        /* Theo dõi đơn hàng cần báo lỗi - độc lập */
        <TheoDoiDonHang rows={processed} isLoading={isLoading} isFiltering={false} />
      ) : (
        /* Báo cáo tình trạng */
        <BaoCaoTinhTrang rows={processed} />
      )}
    </div>
  );
}

/* ── Simple hash function for consistent colors ── */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

/* ── Stat Pill component ── */
function StatPill({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 700, color,
        background: `${color}12`,
        padding: "1px 8px",
        borderRadius: 10,
        minWidth: 30,
        textAlign: "center",
      }}>{value}</span>
    </div>
  );
}
