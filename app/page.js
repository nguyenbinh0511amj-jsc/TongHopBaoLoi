"use client";
import { useState, useMemo, useCallback, useDeferredValue, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataGrid } from "@mui/x-data-grid";
import { viVN } from "@mui/x-data-grid/locales";
import { Input, Button, Select, Space, Spin, Tag, InputNumber, DatePicker, Modal, Checkbox, Tooltip, App as AntApp } from "antd";
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined, ClearOutlined,
  CaretRightOutlined, CaretDownOutlined,
  FilterOutlined, UnorderedListOutlined, AppstoreOutlined,
  LockOutlined, UnlockOutlined,
} from "@ant-design/icons";
import TheoDoiDonHang from "./components/TheoDoiDonHang";
import BaoCaoTinhTrang from "./components/BaoCaoTinhTrang";
import DonHangLoiKHHT from "./components/DonHangLoiKHHT";
import TheoDoiQLCL from "./components/TheoDoiQLCL";

import { usePageContext } from "./components/AppShell";

import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/* ── Hàm chuyển đổi ngày: MM/DD/YYYY → DD/MM/YYYY ── */
function toVNDate(val) {
  if (!val) return "";
  const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return val;
  const [, a, b, y] = m;
  if (Number(a) > 12) return val;
  return `${b}/${a}/${y}`;
}

/* ── Phân tích MM/DD/YYYY sang dayjs ── */
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

/* ── Tải gộp dữ liệu: 1 yêu cầu cho tất cả bảng ── */
async function fetchAllData() {
  const res = await fetch("/api/appsheet?multi=tong_hop_loi,so_giao_nhan,phieu_bao_loi,xac_nhan_ke_hoach,nhan_vien,ke_hoach_pkt_dt,ke_hoach_pkt,Giao_Hang_PSX");
  const json = await res.json();
  if (!json.ok) throw new Error("Fetch failed");
  return {
    loi: json.results?.tong_hop_loi || [],
    sgn: json.results?.so_giao_nhan || [],
    pbl: json.results?.phieu_bao_loi || [],
    khht: json.results?.xac_nhan_ke_hoach || [],
    nhanVien: json.results?.nhan_vien || [],
    keHoachPktDt: json.results?.ke_hoach_pkt_dt || [],
    keHoachPkt: json.results?.ke_hoach_pkt || [],
    giaoHangPSX: json.results?.Giao_Hang_PSX || [],
  };
}

/* ── Buộc xóa cache server + tải lại ── */
async function invalidateAndFetch(table) {
  const res = await fetch(`/api/appsheet?table=${table}&invalidate=1`);
  const json = await res.json();
  if (json.error) throw new Error(json.detail || json.error);
  return json.rows || [];
}

/* ── Các thành phần nhãn hiển thị ── */
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

/* ── Dãy máy color palette ── */
const DAY_MAY_COLORS = [
  { bg: "#dbeafe", color: "#1e40af" },
  { bg: "#fef3c7", color: "#92400e" },
  { bg: "#d1fae5", color: "#065f46" },
  { bg: "#ede9fe", color: "#5b21b6" },
  { bg: "#fce7f3", color: "#9d174d" },
  { bg: "#e0f2fe", color: "#0369a1" },
  { bg: "#fef9c3", color: "#854d0e" },
  { bg: "#f3e8ff", color: "#7e22ce" },
  { bg: "#ccfbf1", color: "#115e59" },
  { bg: "#fee2e2", color: "#991b1b" },
  { bg: "#e0e7ff", color: "#3730a3" },
  { bg: "#fef0c7", color: "#78350f" },
];

function getDayMayColor(val) {
  if (!val) return DAY_MAY_COLORS[0];
  let hash = 0;
  for (let i = 0; i < val.length; i++) {
    hash = ((hash << 5) - hash) + val.charCodeAt(i);
    hash |= 0;
  }
  return DAY_MAY_COLORS[Math.abs(hash) % DAY_MAY_COLORS.length];
}

/* ── Xử lý: nhóm theo ten_chi_tiet, gộp lỗi, tra cứu ngay_nhan ── */
function processData(thongKeLoi, soGiaoNhan) {
  // Tạo bảng tra cứu: order_kd → { ngay_nhan, so_file } từ so_giao_nhan (duyệt 1 lượt)
  const sgnLookup = new Map();
  for (let i = 0; i < soGiaoNhan.length; i++) {
    const r = soGiaoNhan[i];
    if (r.order_kd && r.ngay_nhan) {
      sgnLookup.set(r.order_kd, { ngay_nhan: r.ngay_nhan, so_file: r.so_file || "" });
    }
  }

  // Nhóm theo ten_chi_tiet — duyệt 1 lượt
  const groups = new Map();
  for (let i = 0; i < thongKeLoi.length; i++) {
    const item = thongKeLoi[i];
    const key = (item.ten_chi_tiet || "").trim();
    if (!key) continue;

    // Tra cứu ngay_nhan + so_file sớm — bỏ qua mục không có ngay_nhan
    const sgnEntry = item.order_kd ? (sgnLookup.get(item.order_kd) || null) : null;
    const entryNgayNhan = sgnEntry ? sgnEntry.ngay_nhan : "";
    if (!entryNgayNhan) continue;
    const entrySoFile = sgnEntry ? sgnEntry.so_file : "";

    let g = groups.get(key);
    if (!g) {
      g = { ten_chi_tiet: key, entries: [] };
      groups.set(key, g);
    }
    g.entries.push({ ...item, _ngay_nhan: entryNgayNhan, _so_file: entrySoFile });
  }

  // Xây dựng mảng kết quả
  const result = [];
  let idx = 0;
  for (const [, g] of groups) {
    if (g.entries.length === 0) continue;

    const entries = g.entries;
    const entryLen = entries.length;

    // Gộp trong một lượt duyệt
    let totalSlLoi = 0, totalSlTra = 0;
    const orderKdSet = new Set();
    const maLoiSet = new Set();
    const noiXuLySet = new Set();
    const noiPhatSinhSet = new Set();
    const dayMaySet = new Set();
    const ngayNhans = [];
    const seenOrder = new Set();
    // Đếm số phieu_bao_loi_id duy nhất cho so_lan_loi
    const pblIdSet = new Set();
    let noPblCount = 0;

    // Xây dựng phần tìm kiếm trong cùng vòng lặp
    const searchParts = [g.ten_chi_tiet];

    for (let i = 0; i < entryLen; i++) {
      const e = entries[i];
      totalSlLoi += Number(e.sl_loi) || 0;
      totalSlTra += Number(e.sl_tra) || 0;
      if (e.order_kd) {
        orderKdSet.add(e.order_kd);
        if (e._ngay_nhan && !seenOrder.has(e.order_kd)) {
          seenOrder.add(e.order_kd);
          ngayNhans.push({ order_kd: e.order_kd, ngay_nhan: e._ngay_nhan, so_file: e._so_file || "" });
        }
      }
      if (e.ma_loi) maLoiSet.add(e.ma_loi);
      if (e.noi_xu_ly_loi) noiXuLySet.add(e.noi_xu_ly_loi);
      if (e.noi_phat_sinh_loi) noiPhatSinhSet.add(e.noi_phat_sinh_loi);
      if (e.day_san_xuat_da_gia_cong_tong_hop_loi) dayMaySet.add(e.day_san_xuat_da_gia_cong_tong_hop_loi);
      // Tính lại phân loại trùng lặp
      if (e.phieu_bao_loi_id) pblIdSet.add(e.phieu_bao_loi_id);
      else noPblCount++;
    }

    // so_lan_loi = số phieu_bao_loi_id duy nhất + số mục không có phieu_bao_loi_id
    const soLanLoi = pblIdSet.size + noPblCount;

    // Sắp xếp các mục theo ngay_bao_loi giảm dần
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
      so_lan_loi: soLanLoi,
      tong_sl_loi: totalSlLoi,
      tong_sl_tra: totalSlTra,
      loi_ton: totalSlLoi - totalSlTra,
      order_kds: orderKds,
      ma_lois: maLois,
      noi_xu_lys: [...noiXuLySet],
      noi_phat_sinhs: [...noiPhatSinhSet],
      day_mays: [...dayMaySet],
      ngay_nhans: ngayNhans,
      _allNgayNhanParsed: ngayNhans.map(n => parseDateMMDD(n.ngay_nhan)).filter(d => d && d.isValid()),
      entries,
      _searchText: `${g.ten_chi_tiet}\t${orderKds.join(" ")}\t${maLois.join(" ")}`.toLowerCase(),
    });
  }

  // Sắp xếp theo so_lan_loi giảm dần
  result.sort((a, b) => b.so_lan_loi - a.so_lan_loi);
  return result;
}

/* ── Bảo vệ mật khẩu (dùng chung với TheoDoiDonHang) ── */
const DEFAULT_PASSWORD = "admin123";
const PW_LS_KEY = "theodoi_edit_password";

function getSavedPassword() {
  try {
    return localStorage.getItem(PW_LS_KEY) || DEFAULT_PASSWORD;
  } catch { return DEFAULT_PASSWORD; }
}

/* ════════════════════════════════════════ */
export default function TongHopThongKeLoiPage() {
  const { activePage } = usePageContext();
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterMaLoi, setFilterMaLoi] = useState(null);
  const [filterTenChiTiet, setFilterTenChiTiet] = useState(null);
  const [filterNoiXuLy, setFilterNoiXuLy] = useState(null);
  const [filterNoiPhatSinh, setFilterNoiPhatSinh] = useState(null);
  const [minLanLoi, setMinLanLoi] = useState(3);
  const [ngayNhanFrom, setNgayNhanFrom] = useState(dayjs("2026-05-19"));
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

  /* ── Bảo vệ mật khẩu cho cột "Loại bỏ" ── */
  const [isUnlockedThongKe, setIsUnlockedThongKe] = useState(false);
  const [showPwModalThongKe, setShowPwModalThongKe] = useState(false);
  const [pwInputThongKe, setPwInputThongKe] = useState("");
  const [pwErrorThongKe, setPwErrorThongKe] = useState(false);
  const pendingActionThongKe = useRef(null);

  /* ── Dữ liệu trạng thái cho loại bỏ ── */
  const [statusDataThongKe, setStatusDataThongKe] = useState({});

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/status");
        const json = await res.json();
        if (json.ok && json.data) setStatusDataThongKe(json.data);
      } catch { /* ignore */ }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const updateStatusThongKe = useCallback((rowKey, field, value) => {
    setStatusDataThongKe(prev => {
      const next = { ...prev, [rowKey]: { ...(prev[rowKey] || {}), [field]: value } };
      return next;
    });
    fetch("/api/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: rowKey, field, value }),
    }).catch(() => { /* ignore */ });
  }, []);

  const requirePasswordThongKe = useCallback((action) => {
    if (isUnlockedThongKe) {
      action();
      return;
    }
    pendingActionThongKe.current = action;
    setPwInputThongKe("");
    setPwErrorThongKe(false);
    setShowPwModalThongKe(true);
  }, [isUnlockedThongKe]);

  const handlePwSubmitThongKe = useCallback(() => {
    if (pwInputThongKe === getSavedPassword()) {
      setIsUnlockedThongKe(true);
      setShowPwModalThongKe(false);
      setPwInputThongKe("");
      setPwErrorThongKe(false);
      message.success("Đã mở khóa! Bạn có thể sử dụng chức năng Loại bỏ.");
      if (pendingActionThongKe.current) {
        pendingActionThongKe.current();
        pendingActionThongKe.current = null;
      }
    } else {
      setPwErrorThongKe(true);
    }
  }, [pwInputThongKe, message]);

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

  /* ── Tải cả hai bảng trong một yêu cầu ── */
  const { data: allData, isLoading, isRefetching: refetchingLoi } = useQuery({
    queryKey: ["all_data"],
    queryFn: fetchAllData,
    staleTime: 30 * 1000,            // 30 giây
    gcTime: 5 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,  // 2 phút tự động tải lại
    refetchOnWindowFocus: "always",
  });

  const rawLoi = allData?.loi || [];
  const rawSGN = allData?.sgn || [];
  const rawPBL = allData?.pbl || [];
  const rawKHHT = allData?.khht || [];
  const rawNV = allData?.nhanVien || [];
  const rawKHPKTDT = allData?.keHoachPktDt || [];
  const rawKHPKT = allData?.keHoachPkt || [];
  const rawGHPSX = allData?.giaoHangPSX || [];

  /* ── Làm mới thông minh: xóa cache server + tải lại ── */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Xóa cache server + tải dữ liệu mới song song
      const [loiData, sgnData] = await Promise.all([
        invalidateAndFetch("tong_hop_loi"),
        invalidateAndFetch("so_giao_nhan"),
      ]);
      // Cập nhật cache React Query trực tiếp
      queryClient.setQueryData(["all_data"], { loi: loiData, sgn: sgnData });
    } catch (err) {
      console.error("Lỗi làm mới:", err);
      queryClient.invalidateQueries({ queryKey: ["all_data"] });
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  /* ── Xử lý dữ liệu ── */
  const processed = useMemo(() => processData(rawLoi, rawSGN), [rawLoi, rawSGN]);

  /* ── Giá trị lọc duy nhất ── */
  const uniqueMaLoi = useMemo(() => [...new Set(rawLoi.map(r => r.ma_loi).filter(Boolean))].sort(), [rawLoi]);
  const uniqueTenChiTiet = useMemo(() => [...new Set(processed.map(r => r.ten_chi_tiet).filter(Boolean))].sort(), [processed]);
  const uniqueNoiXuLy = useMemo(() => [...new Set(rawLoi.map(r => r.noi_xu_ly_loi).filter(Boolean))].sort(), [rawLoi]);
  const uniqueNoiPhatSinh = ["PSX", "PKT", "Phôi", "PKY"];

  /* ── Lọc dữ liệu ── */
  const rows = useMemo(() => {
    let data = processed;

    // Số lần lỗi tối thiểu — dựa trên TỔNG số lần lỗi GỐC (trước khi lọc từng mục)
    data = data.filter(r => r.so_lan_loi >= (deferredMinLan || 1));

    // Lọc tên chi tiết (cấp nhóm)
    if (deferredTenChiTiet) data = data.filter(r => r.ten_chi_tiet === deferredTenChiTiet);

    // Tìm kiếm văn bản (cấp nhóm)
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

        // Xây dựng lại tổng hợp từ các mục đã lọc
        const ngayNhans = [];
        const seen = new Set();
        filteredEntries.forEach(e => {
          if (e.order_kd && e._ngay_nhan && !seen.has(e.order_kd)) {
            seen.add(e.order_kd);
            ngayNhans.push({ order_kd: e.order_kd, ngay_nhan: e._ngay_nhan, so_file: e._so_file || "" });
          }
        });

        // Đếm số phieu_bao_loi_id duy nhất cho các mục đã lọc
        const pblSet = new Set();
        let noPbl = 0;
        filteredEntries.forEach(e => {
          if (e.phieu_bao_loi_id) pblSet.add(e.phieu_bao_loi_id);
          else noPbl++;
        });

        return {
          ...r,
          entries: filteredEntries,
          so_lan_loi: pblSet.size + noPbl,
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

  /* ── Thống kê ── */
  const stats = useMemo(() => ({
    chiTiet: rows.length,
    tongLanLoi: rows.reduce((s, r) => s + r.so_lan_loi, 0),
    tongSlLoi: rows.reduce((s, r) => s + r.tong_sl_loi, 0),
    loiTon: rows.reduce((s, r) => s + r.loi_ton, 0),
  }), [rows]);

  const hasActiveFilter = !!filterMaLoi || !!filterTenChiTiet || !!filterNoiXuLy || !!filterNoiPhatSinh || !!ngayNhanFrom || !!ngayNhanTo || !!ngayBaoLoiFrom || !!ngayBaoLoiTo;
  const isFiltering = deferredSearch !== search || deferredMaLoi !== filterMaLoi || deferredTenChiTiet !== filterTenChiTiet || deferredNoiXuLy !== filterNoiXuLy || deferredNoiPhatSinh !== filterNoiPhatSinh || deferredMinLan !== minLanLoi || deferredNgayNhanFrom !== ngayNhanFrom || deferredNgayNhanTo !== ngayNhanTo || deferredNgayBaoLoiFrom !== ngayBaoLoiFrom || deferredNgayBaoLoiTo !== ngayBaoLoiTo;

  /* ── Mở rộng/thu gọn dòng ── */
  const toggleExpand = useCallback((id) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /* ── Xây dựng dòng phẳng (cha + con mở rộng) ── */
  const flatRows = useMemo(() => {
    // Sắp xếp dòng cha theo sortModel
    let sortedParents = [...rows];
    if (sortModel.length > 0) {
      const { field, sort } = sortModel[0];
      sortedParents.sort((a, b) => {
        let va = a[field];
        let vb = b[field];
        // Xử lý mảng (ma_lois, order_kds, ...)
        if (Array.isArray(va)) va = va.join(", ");
        if (Array.isArray(vb)) vb = vb.join(", ");
        // Xử lý số
        if (typeof va === "number" && typeof vb === "number") {
          return sort === "asc" ? va - vb : vb - va;
        }
        // Xử lý chuỗi
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
            so_file: entry._so_file || "",
            da_co_xac_nhan: entry.da_co_xac_nhan || "",
          });
        });
      }
    });
    return result;
  }, [rows, expandedRows, sortModel]);

  /* ── Xuất Excel ── */
  const exportExcel = useCallback(() => {
    import("xlsx").then(XLSX => {
      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Tổng hợp (grouped summary) ──
      const summaryHeaders = ["STT", "Tên chi tiết", "Số file", "Số lần lỗi", "Tổng SL lỗi", "SL trả", "Lỗi tồn", "Các Order KD", "Các mã lỗi", "Nơi xử lý", "Dãy máy gia công", "Ngày nhận hàng", "Loại bỏ"];
      const summaryData = rows.map((r, i) => {
        const noiPS = (r.noi_phat_sinhs || [])[0] || "";
        const stKey = `${r.ten_chi_tiet}|||${noiPS}`;
        return [
          i + 1,
          r.ten_chi_tiet,
          [...new Set(r.ngay_nhans.map(n => n.so_file).filter(Boolean))].join(", "),
          r.so_lan_loi,
          r.tong_sl_loi,
          r.tong_sl_tra,
          r.loi_ton,
          r.order_kds.join(", "),
          r.ma_lois.join(", "),
          r.noi_xu_lys.join(", "),
          (r.day_mays || []).join(", "),
          r.ngay_nhans.map(n => `${n.order_kd}: ${toVNDate(n.ngay_nhan)}`).join("; "),
          statusDataThongKe[stKey]?.loai_bo ? "Có" : "",
        ];
      });
      const ws1 = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryData]);
      // Độ rộng cột tự động
      ws1["!cols"] = summaryHeaders.map((h, i) => ({
        wch: Math.max(h.length, ...summaryData.map(r => String(r[i] || "").length).slice(0, 50), 8),
      }));
      XLSX.utils.book_append_sheet(wb, ws1, "Tổng hợp");

      // ── Sheet 2: Chi tiết (all individual entries) ──
      const detailHeaders = ["STT", "Tên chi tiết", "Số file", "Order KD", "Mã lỗi", "Nội dung lỗi", "SL lỗi", "SL trả", "Ngày báo lỗi", "Ngày trả lỗi", "Nơi xử lý", "Nơi phát sinh", "Dãy máy gia công", "Ngày nhận hàng", "Trạng thái", "Đã xác nhận xin xử lý"];
      const detailData = [];
      let stt = 0;
      rows.forEach(r => {
        r.entries.forEach(e => {
          stt++;
          detailData.push([
            stt,
            r.ten_chi_tiet,
            e._so_file || "",
            e.order_kd || "",
            e.ma_loi || "",
            e.noi_dung_loi || "",
            Number(e.sl_loi) || 0,
            Number(e.sl_tra) || 0,
            toVNDate(e.ngay_bao_loi) || "",
            toVNDate(e.ngay_tra_loi) || "",
            e.noi_xu_ly_loi || "",
            e.noi_phat_sinh_loi || "",
            e.day_san_xuat_da_gia_cong_tong_hop_loi || "",
            toVNDate(e._ngay_nhan) || "",
            e.trang_thai || "",
            e.da_co_xac_nhan || "",
          ]);
        });
      });
      const ws2 = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailData]);
      ws2["!cols"] = detailHeaders.map((h, i) => ({
        wch: Math.max(h.length, ...detailData.slice(0, 50).map(r => String(r[i] || "").length), 8),
      }));
      XLSX.utils.book_append_sheet(wb, ws2, "Chi tiết");

      // Tải xuống
      XLSX.writeFile(wb, `Thong_ke_bao_loi_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  }, [rows, statusDataThongKe]);

  /* ── Xóa tất cả bộ lọc ── */
  const clearAllFilters = useCallback(() => {
    setSearch("");
    setFilterMaLoi(null);
    setFilterTenChiTiet(null);
    setFilterNoiXuLy(null);
    setFilterNoiPhatSinh(null);
    setNgayNhanFrom(dayjs("2026-05-19"));
    setNgayNhanTo(null);
    setNgayBaoLoiFrom(null);
    setNgayBaoLoiTo(null);
  }, []);

  /* ── Cột dữ liệu ── */
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
      field: "so_files", headerName: "Số file", minWidth: 120, width: 120, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") {
          const val = p.row.so_file;
          return <span style={{ fontSize: 12, color: val ? "#374151" : "#d1d5db" }}>{val || "—"}</span>;
        }
        const arr = p.row.ngay_nhans || [];
        const soFiles = [...new Set(arr.map(n => n.so_file).filter(Boolean))];
        if (!soFiles.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center", overflow: "hidden" }} title={soFiles.join(", ")}>
            <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: "#e0f2fe", color: "#0369a1", whiteSpace: "nowrap" }}>{soFiles[0]}</span>
            {soFiles.length > 1 && <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>+{soFiles.length - 1}</span>}
          </div>
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
          <div style={{ display: "flex", gap: 3, alignItems: "center", overflow: "hidden" }} title={arr.join(", ")}>
            <MaLoiBadge value={arr[0]} />
            {arr.length > 1 && <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>+{arr.length - 1}</span>}
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
          <div style={{ display: "flex", gap: 3, alignItems: "center", overflow: "hidden" }} title={arr.join(", ")}>
            <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: "#f3f4f6", color: "#374151", whiteSpace: "nowrap" }}>{arr[0]}</span>
            {arr.length > 1 && <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>+{arr.length - 1}</span>}
          </div>
        );
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
      field: "noi_phat_sinhs", headerName: "Nơi phát sinh", minWidth: 140, width: 140, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") return <NoiXuLyBadge value={p.row.noi_phat_sinh_loi} />;
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center", overflow: "hidden" }} title={arr.join(", ")}>
            <NoiXuLyBadge value={arr[0]} />
            {arr.length > 1 && <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>+{arr.length - 1}</span>}
          </div>
        );
      },
    },
    {
      field: "day_mays", headerName: "Dãy máy gia công", minWidth: 150, width: 150, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") {
          const val = p.row.day_san_xuat_da_gia_cong_tong_hop_loi;
          if (!val) return <span style={{ color: "#d1d5db" }}>—</span>;
          const c = getDayMayColor(val);
          return <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: c.bg, color: c.color, whiteSpace: "nowrap" }}>{val}</span>;
        }
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center", overflow: "hidden" }} title={arr.join(", ")}>
            {arr.map(v => {
              const c = getDayMayColor(v);
              return <span key={v} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: c.bg, color: c.color, whiteSpace: "nowrap" }}>{v}</span>;
            })}
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
      field: "noi_xu_lys", headerName: "Nơi xử lý", minWidth: 130, width: 130, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") return <NoiXuLyBadge value={p.row.noi_xu_ly_loi} />;
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center", overflow: "hidden" }} title={arr.join(", ")}>
            <NoiXuLyBadge value={arr[0]} />
            {arr.length > 1 && <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>+{arr.length - 1}</span>}
          </div>
        );
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
    {
      field: "_childDaXacNhan", headerName: "Đã xác nhận xin xử lý", minWidth: 160, width: 160, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") {
          const val = p.row.da_co_xac_nhan;
          if (!val) return <span style={{ color: "#bfbfbf" }}>—</span>;
          const isConfirmed = val === "Y" || val === "Có" || val === "true" || val === "1" || val === "Yes";
          return (
            <span style={{
              padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
              background: isConfirmed ? "#d1fae5" : "#fee2e2",
              color: isConfirmed ? "#065f46" : "#991b1b",
              whiteSpace: "nowrap",
            }}>{val}</span>
          );
        }
        // Dòng cha: hiển thị số lượng tóm tắt
        const entries = p.row.entries || [];
        if (!entries.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        const confirmed = entries.filter(e => {
          const v = e.da_co_xac_nhan;
          return v === "Y" || v === "Có" || v === "true" || v === "1" || v === "Yes";
        }).length;
        if (confirmed === 0) return <span style={{ color: "#bfbfbf" }}>0/{entries.length}</span>;
        return (
          <span style={{
            padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
            background: confirmed === entries.length ? "#d1fae5" : "#fef3c7",
            color: confirmed === entries.length ? "#065f46" : "#92400e",
          }}>{confirmed}/{entries.length}</span>
        );
      },
    },
    {
      field: "loai_bo", headerName: "Loại bỏ", minWidth: 90, width: 90, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        if (p.row._type === "child") return null;
        // Tạo khóa từ ten_chi_tiet và noi_phat_sinh đầu tiên
        const tenCT = p.row.ten_chi_tiet || "";
        const noiPS = (p.row.noi_phat_sinhs || [])[0] || "";
        const key = `${tenCT}|||${noiPS}`;
        const checked = !!statusDataThongKe[key]?.loai_bo;
        const handleChange = () => {
          requirePasswordThongKe(() => {
            updateStatusThongKe(key, "loai_bo", !checked);
          });
        };
        return (
          <Tooltip title={isUnlockedThongKe ? (checked ? "Bỏ đánh dấu loại bỏ" : "Đánh dấu loại bỏ") : "🔒 Cần mở khóa"}>
            <div
              onClick={(e) => { e.stopPropagation(); handleChange(); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "100%", height: "100%", cursor: "pointer",
              }}
            >
              <Checkbox
                checked={checked}
                style={{ pointerEvents: "none" }}
              />
            </div>
          </Tooltip>
        );
      },
    },
  ], [expandedRows, toggleExpand, statusDataThongKe, requirePasswordThongKe, updateStatusThongKe, isUnlockedThongKe]);

  /* ════════════════════ RENDER ════════════════════ */
  const activeFilterCount = [filterMaLoi, filterTenChiTiet, filterNoiXuLy, filterNoiPhatSinh, ngayNhanFrom, ngayNhanTo].filter(Boolean).length;

  const mainTabs = [
    { key: "thongke", label: "Thống kê báo lỗi", shortLabel: "Thống kê", icon: "📊", color: "#fff", colorInactive: "#1e40af", bg: "linear-gradient(135deg, #2563eb, #1d4ed8)", bgInactive: "#dbeafe", border: "#2563eb", shadow: "0 2px 8px rgba(37,99,235,0.35)" },
    { key: "theodoi", label: "Theo dõi đơn hàng cần báo lỗi", shortLabel: "Theo dõi", icon: "📋", color: "#fff", colorInactive: "#b45309", bg: "linear-gradient(135deg, #d97706, #b45309)", bgInactive: "#fef3c7", border: "#d97706", shadow: "0 2px 8px rgba(217,119,6,0.35)" },
    { key: "baocao", label: "Báo cáo tình trạng", shortLabel: "Báo cáo", icon: "📈", color: "#fff", colorInactive: "#7c3aed", bg: "linear-gradient(135deg, #8b5cf6, #7c3aed)", bgInactive: "#ede9fe", border: "#8b5cf6", shadow: "0 2px 8px rgba(139,92,246,0.35)" },
    { key: "khht", label: "Tổng hợp đơn hàng lỗi trên KHHT", shortLabel: "KHHT", icon: "📦", color: "#fff", colorInactive: "#0e7490", bg: "linear-gradient(135deg, #06b6d4, #0891b2)", bgInactive: "#cffafe", border: "#06b6d4", shadow: "0 2px 8px rgba(6,182,212,0.35)" },
    { key: "qlcl", label: "Theo dõi tiến độ QLCL", shortLabel: "QLCL", icon: "🔍", color: "#fff", colorInactive: "#047857", bg: "linear-gradient(135deg, #10b981, #059669)", bgInactive: "#d1fae5", border: "#10b981", shadow: "0 2px 8px rgba(16,185,129,0.35)" },
  ];

  /* ── Chuyển trang ── */


  return (
    <div className="page-container" style={{ maxWidth: "100%", height: "calc(100vh - 48px)", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Thanh tab */}
      <div className="tab-bar" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px 0", background: "#f8fafc", borderBottom: "1px solid #e5e7eb",
      }}>
        <div className="tab-list" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {mainTabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                className="tab-btn"
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: isActive ? "10px 22px" : "9px 18px",
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? tab.color : tab.colorInactive,
                  background: isActive ? tab.bg : tab.bgInactive,
                  border: isActive ? "none" : `1.5px solid ${tab.border}33`,
                  borderBottom: isActive ? `3px solid ${tab.border}` : "3px solid transparent",
                  borderRadius: "8px 8px 0 0",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  whiteSpace: "nowrap",
                  boxShadow: isActive ? tab.shadow : "none",
                  transform: isActive ? "translateY(-1px)" : "none",
                  letterSpacing: isActive ? "0.02em" : "0",
                }}
              >
                <span style={{ marginRight: 6 }}>{tab.icon}</span>
                <span className="tab-label-full">{tab.label}</span>
                <span className="tab-label-short">{tab.shortLabel}</span>
              </button>
            );
          })}
          {(isFiltering || refetchingLoi || isRefreshing) && <Spin size="small" style={{ marginLeft: 12 }} />}
        </div>
        <Button size="small" icon={<ReloadOutlined spin={isRefreshing || refetchingLoi} />}
          onClick={handleRefresh}
          title="Làm mới dữ liệu từ server (bỏ cache)" />
      </div>

      {/* Vùng nội dung */}
      <div key={activeTab} className="tab-content-enter" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {activeTab === "thongke" ? (
        <>
          {/* Thống kê + Xuất Excel cho tab 1 */}
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

          {/* Thanh lọc cho tab 1 */}
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
            <div style={{ width: 1, height: 16, background: "#e2e8f0" }} />
            {isUnlockedThongKe ? (
              <Tooltip title="Đã mở khóa — cột Loại bỏ đang hoạt động">
                <Button
                  size="small" type="text"
                  icon={<UnlockOutlined style={{ color: "#059669" }} />}
                  onClick={() => setIsUnlockedThongKe(false)}
                  style={{ fontSize: 11, color: "#059669" }}
                >
                  Đã mở khóa
                </Button>
              </Tooltip>
            ) : (
              <Tooltip title="Nhấn để mở khóa chức năng Loại bỏ">
                <Button
                  size="small" type="text"
                  icon={<LockOutlined style={{ color: "#d97706" }} />}
                  onClick={() => { setPwInputThongKe(""); setPwErrorThongKe(false); setShowPwModalThongKe(true); }}
                  style={{ fontSize: 11, color: "#d97706" }}
                >
                  Mở khóa
                </Button>
              </Tooltip>
            )}
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
      ) : activeTab === "khht" ? (
        /* Tổng hợp đơn hàng lỗi trên KHHT */
        <DonHangLoiKHHT xacNhanKeHoach={rawKHHT} phieuBaoLoi={rawPBL} tongHopLoi={rawLoi} giaoHangPSX={rawGHPSX} isLoading={isLoading} />
      ) : activeTab === "qlcl" ? (
        /* Theo dõi tiến độ QLCL */
        <TheoDoiQLCL nhanVien={rawNV} keHoachPktDt={rawKHPKTDT} keHoachPkt={rawKHPKT} isLoading={isLoading} />
      ) : (
        /* Báo cáo tình trạng */
        <BaoCaoTinhTrang rows={processed} />
      )}
      </div>

      {/* ── Password Modal for Thống kê ── */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LockOutlined style={{ color: "#d97706" }} />
            <span>Nhập mật khẩu để sử dụng</span>
          </div>
        }
        open={showPwModalThongKe}
        onCancel={() => { setShowPwModalThongKe(false); setPwInputThongKe(""); setPwErrorThongKe(false); pendingActionThongKe.current = null; }}
        onOk={handlePwSubmitThongKe}
        okText="Xác nhận"
        cancelText="Hủy"
        centered
        width={380}
        okButtonProps={{ disabled: !pwInputThongKe }}
      >
        <div style={{ padding: "12px 0" }}>
          <p style={{ fontSize: 13, color: "#4b5563", marginBottom: 12 }}>
            Cột "Loại bỏ" được bảo vệ. Vui lòng nhập mật khẩu để tiếp tục.
          </p>
          <Input.Password
            placeholder="Nhập mật khẩu..."
            value={pwInputThongKe}
            onChange={e => setPwInputThongKe(e.target.value)}
            onPressEnter={handlePwSubmitThongKe}
            status={pwErrorThongKe ? "error" : undefined}
            autoFocus
          />
          {pwErrorThongKe && (
            <p style={{ color: "#dc2626", fontSize: 12, marginTop: 6 }}>
              Mật khẩu không đúng. Vui lòng thử lại.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ── Hàm băm đơn giản cho màu nhất quán ── */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

/* ── Thành phần nhãn thống kê ── */
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
