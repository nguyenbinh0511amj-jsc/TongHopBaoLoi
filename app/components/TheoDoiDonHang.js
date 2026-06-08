"use client";
import { useState, useMemo, useEffect, forwardRef, useImperativeHandle, useCallback, useDeferredValue, useRef } from "react";
import { DataGrid } from "@mui/x-data-grid";
import { viVN } from "@mui/x-data-grid/locales";
import { Input, Select, InputNumber, Button, DatePicker, Modal, App as AntApp, Tooltip } from "antd";
import { SearchOutlined, DownloadOutlined, ClearOutlined, LockOutlined, SettingOutlined, UnlockOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/* ── Badge: mã lỗi + số lần ── */
function MaLoiCountBadge({ code, count }) {
  const colors = {
    F1: "#dc2626", F2: "#ea580c", F3: "#d97706", F4: "#ca8a04",
    F5: "#65a30d", F6: "#0d9488", F7: "#2563eb", F8: "#7c3aed",
    F9: "#c026d3", F10: "#e11d48",
  };
  const prefix = code.match(/^F\d+/)?.[0] || "";
  const c = colors[prefix] || "#4b5563";
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: `${c}12`, color: c, whiteSpace: "nowrap", border: `1px solid ${c}25`,
    }}>
      {code} <b>({count})</b>
    </span>
  );
}

function NoiXuLyBadge({ value }) {
  if (!value) return null;
  const colorMap = {
    PSX: { bg: "#fef3c7", color: "#92400e", border: "#fbbf2440" },
    PKT: { bg: "#dbeafe", color: "#1e40af", border: "#3b82f640" },
    PKY: { bg: "#ede9fe", color: "#5b21b6", border: "#8b5cf640" },
    "Phôi": { bg: "#fce7f3", color: "#9d174d", border: "#ec489940" },
  };
  const c = colorMap[value] || { bg: "#f3f4f6", color: "#4b5563", border: "#9ca3af40" };
  return <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{value}</span>;
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

/* ── Bộ phận config ── */
const BO_PHAN_LIST = [
  { key: "PSX", label: "PSX", icon: "🏭", gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)", color: "#92400e", bgLight: "#fffbeb" },
  { key: "PKT", label: "PKT", icon: "🔧", gradient: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)", color: "#1e40af", bgLight: "#eff6ff" },
  { key: "PKY", label: "PKY", icon: "⚙️", gradient: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)", color: "#5b21b6", bgLight: "#f5f3ff" },
  { key: "Phôi", label: "Phôi", icon: "📦", gradient: "linear-gradient(135deg, #f472b6 0%, #ec4899 100%)", color: "#9d174d", bgLight: "#fdf2f8" },
];

/* ── Phân tích MM/DD/YYYY → dayjs ── */
function parseEntryDate(val) {
  if (!val) return null;
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, month, day, year] = m;
  return dayjs(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`);
}

/* ── Xử lý: lọc mục → nhóm → đếm ── */
function processOrderData(rows, { minLan, boPhan, filterMaLoi, ngayNhanFrom, ngayNhanTo, ngayBaoLoiFrom, ngayBaoLoiTo, search }) {
  // 1. Trải phẳng tất cả mục
  let allEntries = [];
  rows.forEach(group => {
    group.entries.forEach(entry => {
      allEntries.push({ ...entry, _ten_chi_tiet: group.ten_chi_tiet });
    });
  });

  // 1.5. Chỉ giữ các mục có da_co_xac_nhan = FALSE
  allEntries = allEntries.filter(e => {
    const v = (e.da_co_xac_nhan || "").toString().trim().toUpperCase();
    return v === "FALSE" || v === "N" || v === "0" || v === "";
  });

  // 2. Lọc mục TRƯỚC khi nhóm
  if (boPhan && boPhan !== "all") {
    allEntries = allEntries.filter(e => e.noi_phat_sinh_loi === boPhan);
  }
  if (filterMaLoi) {
    allEntries = allEntries.filter(e => e.ma_loi === filterMaLoi);
  }
  if (ngayNhanFrom || ngayNhanTo) {
    allEntries = allEntries.filter(e => {
      const d = parseEntryDate(e._ngay_nhan);
      if (!d || !d.isValid()) return false;
      if (ngayNhanFrom && d.isBefore(ngayNhanFrom, 'day')) return false;
      if (ngayNhanTo && d.isAfter(ngayNhanTo, 'day')) return false;
      return true;
    });
  }
  if (ngayBaoLoiFrom || ngayBaoLoiTo) {
    allEntries = allEntries.filter(e => {
      const d = parseEntryDate(e.ngay_bao_loi);
      if (!d || !d.isValid()) return false;
      if (ngayBaoLoiFrom && d.isBefore(ngayBaoLoiFrom, 'day')) return false;
      if (ngayBaoLoiTo && d.isAfter(ngayBaoLoiTo, 'day')) return false;
      return true;
    });
  }
  if (search) {
    const s = search.toLowerCase();
    allEntries = allEntries.filter(e =>
      (e._ten_chi_tiet || "").toLowerCase().includes(s) ||
      (e.order_kd || "").toLowerCase().includes(s) ||
      (e.ma_loi || "").toLowerCase().includes(s)
    );
  }

  // 3. Nhóm theo ten_chi_tiet + noi_phat_sinh_loi
  const groups = new Map();
  for (const entry of allEntries) {
    const tenCT = entry._ten_chi_tiet || "";
    const noiPS = entry.noi_phat_sinh_loi || "";
    if (!tenCT) continue;
    const key = `${tenCT}|||${noiPS}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  // 4. Xây dựng kết quả, chỉ giữ ≥ minLan
  const result = [];
  let idx = 0;
  for (const [key, entries] of groups) {
    const [tenChiTiet, noiPhatSinh] = key.split("|||");
    let totalSlLoi = 0, totalSlTra = 0;
    const orderKdSet = new Set();
    const maLoiCount = new Map();
    const dayMaySet = new Set();
    const soFileSet = new Set();
    // Đếm số phieu_bao_loi_id duy nhất cho so_lan_loi
    const pblIdSet = new Set();
    let noPblCount = 0;

    for (const e of entries) {
      totalSlLoi += Number(e.sl_loi) || 0;
      totalSlTra += Number(e.sl_tra) || 0;
      if (e.order_kd) orderKdSet.add(e.order_kd);
      if (e.ma_loi) maLoiCount.set(e.ma_loi, (maLoiCount.get(e.ma_loi) || 0) + 1);
      if (e.day_san_xuat_da_gia_cong_tong_hop_loi) dayMaySet.add(e.day_san_xuat_da_gia_cong_tong_hop_loi);
      if (e._so_file) soFileSet.add(e._so_file);
      // Theo dõi phieu_bao_loi_id
      if (e.phieu_bao_loi_id) pblIdSet.add(e.phieu_bao_loi_id);
      else noPblCount++;
    }

    // so_lan_loi = số phieu_bao_loi_id duy nhất + số mục không có phieu_bao_loi_id
    const soLanLoi = pblIdSet.size + noPblCount;
    if (soLanLoi < minLan) continue;

    const maLoiArr = [...maLoiCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count }));

    result.push({
      id: idx++,
      ten_chi_tiet: tenChiTiet,
      noi_phat_sinh: noiPhatSinh,
      so_lan_loi: soLanLoi,
      tong_sl_loi: totalSlLoi,
      tong_sl_tra: totalSlTra,
      loi_ton: totalSlLoi - totalSlTra,
      order_kds: [...orderKdSet],
      ma_loi_counts: maLoiArr,
      day_mays: [...dayMaySet],
      so_files: [...soFileSet],
    });
  }

  result.sort((a, b) => b.so_lan_loi - a.so_lan_loi);
  return result;
}

/* ════════════════════════════════════════ */
const DEFAULT_PASSWORD = "admin123";
const PW_LS_KEY = "theodoi_edit_password";

function getSavedPassword() {
  try {
    return localStorage.getItem(PW_LS_KEY) || DEFAULT_PASSWORD;
  } catch { return DEFAULT_PASSWORD; }
}

const TheoDoiDonHang = forwardRef(function TheoDoiDonHang({ rows, isLoading, isFiltering }, ref) {
  const { message } = AntApp.useApp();
  const [boPhan, setBoPhan] = useState("all");
  const [sortModel, setSortModel] = useState([]);
  const [search, setSearch] = useState("");
  const [filterMaLoi, setFilterMaLoi] = useState(null);
  const [minLanLoi, setMinLanLoi] = useState(3);
  const [ngayNhanFrom, setNgayNhanFrom] = useState(dayjs("2026-05-19"));
  const [ngayNhanTo, setNgayNhanTo] = useState(null);
  const [ngayBaoLoiFrom, setNgayBaoLoiFrom] = useState(null);
  const [ngayBaoLoiTo, setNgayBaoLoiTo] = useState(null);

  /* ── Bảo vệ mật khẩu ── */
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const pendingAction = useRef(null);

  /* ── Đổi mật khẩu ── */
  const [showChangePwModal, setShowChangePwModal] = useState(false);
  const [changePwOld, setChangePwOld] = useState("");
  const [changePwNew, setChangePwNew] = useState("");
  const [changePwConfirm, setChangePwConfirm] = useState("");
  const [changePwError, setChangePwError] = useState("");

  const requirePassword = useCallback((action) => {
    if (isUnlocked) {
      action();
      return;
    }
    pendingAction.current = action;
    setPwInput("");
    setPwError(false);
    setShowPwModal(true);
  }, [isUnlocked]);

  const handlePwSubmit = useCallback(() => {
    if (pwInput === getSavedPassword()) {
      setIsUnlocked(true);
      setShowPwModal(false);
      setPwInput("");
      setPwError(false);
      message.success("Đã mở khóa! Bạn có thể chỉnh sửa tình trạng báo lỗi.");
      if (pendingAction.current) {
        pendingAction.current();
        pendingAction.current = null;
      }
    } else {
      setPwError(true);
    }
  }, [pwInput, message]);

  const handleChangePwSubmit = useCallback(() => {
    const currentPw = getSavedPassword();
    if (changePwOld !== currentPw) {
      setChangePwError("Mật khẩu cũ không đúng.");
      return;
    }
    if (!changePwNew || changePwNew.length < 4) {
      setChangePwError("Mật khẩu mới phải có ít nhất 4 ký tự.");
      return;
    }
    if (changePwNew !== changePwConfirm) {
      setChangePwError("Mật khẩu xác nhận không khớp.");
      return;
    }
    try {
      localStorage.setItem(PW_LS_KEY, changePwNew);
    } catch { /* ignore */ }
    setShowChangePwModal(false);
    setChangePwOld("");
    setChangePwNew("");
    setChangePwConfirm("");
    setChangePwError("");
    setIsUnlocked(false);
    message.success("Đổi mật khẩu thành công!");
  }, [changePwOld, changePwNew, changePwConfirm, message]);

  const deferredSearch = useDeferredValue(search);

  /* ── Dữ liệu trạng thái (chia sẻ qua API) ── */
  const [statusData, setStatusData] = useState({});
  const statusRef = useRef(statusData);
  statusRef.current = statusData;

  // Tải trạng thái từ server
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const json = await res.json();
      if (json.ok && json.data) {
        setStatusData(json.data);
      }
    } catch { /* ignore */ }
  }, []);

  // Tải khi khởi động + lấy mới mỗi 5 giây cho các thay đổi của người dùng khác
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Hàng đợi ghi để tránh các lần ghi đồng thời ghi đè nhau
  const writeQueue = useRef(Promise.resolve());

  const updateStatusBatch = useCallback((rowKey, fields) => {
    // fields là một object như { tinh_trang: "...", ngay_yeu_cau: "..." }
    // Cập nhật lạc quan
    setStatusData(prev => {
      const next = { ...prev, [rowKey]: { ...(prev[rowKey] || {}), ...fields } };
      return next;
    });
    // Lưu vào server — xếp hàng để tuần tự hóa việc ghi
    writeQueue.current = writeQueue.current.then(() =>
      fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merge: { [rowKey]: fields } }),
      }).catch(() => { /* ignore */ })
    );
  }, []);

  const updateStatus = useCallback((rowKey, field, value) => {
    updateStatusBatch(rowKey, { [field]: value });
  }, [updateStatusBatch]);

  /* ── Tất cả dữ liệu (không lọc bp/search, để lấy tùy chọn duy nhất) ── */
  const allDataForOptions = useMemo(() =>
    processOrderData(rows, { minLan: 1, boPhan: "all", filterMaLoi: null, ngayNhanFrom: null, ngayNhanTo: null, search: "" }),
  [rows]);

  /* ── Tùy chọn mã lỗi duy nhất ── */
  const uniqueMaLoi = useMemo(() => {
    const set = new Set();
    allDataForOptions.forEach(r => r.ma_loi_counts.forEach(m => set.add(m.code)));
    return [...set].sort();
  }, [allDataForOptions]);

  /* ── Dữ liệu đã lọc + nhóm (loại trừ loại bỏ) ── */
  const orderRows = useMemo(() => {
    const data = processOrderData(rows, { minLan: minLanLoi, boPhan, filterMaLoi, ngayNhanFrom, ngayNhanTo, ngayBaoLoiFrom, ngayBaoLoiTo, search: deferredSearch });
    return data.filter(r => {
      const key = `${r.ten_chi_tiet}|||${r.noi_phat_sinh}`;
      return !statusData[key]?.loai_bo;
    });
  }, [rows, minLanLoi, boPhan, filterMaLoi, ngayNhanFrom, ngayNhanTo, ngayBaoLoiFrom, ngayBaoLoiTo, deferredSearch, statusData]);

  /* ── Thống kê theo bộ phận (lọc theo ngày/mã lỗi/tìm kiếm nhưng không theo boPhan, loại trừ loại bỏ) ── */
  const allFilteredNoBp = useMemo(() => {
    const data = processOrderData(rows, { minLan: minLanLoi, boPhan: "all", filterMaLoi, ngayNhanFrom, ngayNhanTo, ngayBaoLoiFrom, ngayBaoLoiTo, search: deferredSearch });
    return data.filter(r => {
      const key = `${r.ten_chi_tiet}|||${r.noi_phat_sinh}`;
      return !statusData[key]?.loai_bo;
    });
  }, [rows, minLanLoi, filterMaLoi, ngayNhanFrom, ngayNhanTo, ngayBaoLoiFrom, ngayBaoLoiTo, deferredSearch, statusData]);

  const boPhanStats = useMemo(() => {
    const stats = { all: { count: allFilteredNoBp.length, slLoi: 0, loiTon: 0 } };
    allFilteredNoBp.forEach(r => {
      stats.all.slLoi += r.tong_sl_loi;
      stats.all.loiTon += r.loi_ton;
    });

    for (const bp of BO_PHAN_LIST) {
      const filtered = allFilteredNoBp.filter(r => r.noi_phat_sinh === bp.key);
      stats[bp.key] = {
        count: filtered.length,
        slLoi: filtered.reduce((s, r) => s + r.tong_sl_loi, 0),
        loiTon: filtered.reduce((s, r) => s + r.loi_ton, 0),
      };
    }
    return stats;
  }, [allFilteredNoBp]);

  const hasActiveFilter = !!search || !!filterMaLoi || !!ngayNhanFrom || !!ngayNhanTo || !!ngayBaoLoiFrom || !!ngayBaoLoiTo;
  const clearAllFilters = useCallback(() => {
    setSearch("");
    setFilterMaLoi(null);
    setNgayNhanFrom(dayjs("2026-05-19"));
    setNgayNhanTo(null);
    setNgayBaoLoiFrom(null);
    setNgayBaoLoiTo(null);
  }, []);

  /* ── Xuất Excel ── */
  const exportExcel = useCallback(() => {
    import("xlsx").then(XLSX => {
      const wb = XLSX.utils.book_new();
      const headers = ["STT", "Tên chi tiết", "Số file", "Số lần lỗi", "Mã lỗi (số lần)", "Các Order KD", "Dãy máy gia công", "Tình trạng báo lỗi", "Ngày yêu cầu", "Thời hạn", "Ngày hoàn thành"];

      for (const bp of BO_PHAN_LIST) {
        const bpRows = allFilteredNoBp.filter(r => r.noi_phat_sinh === bp.key);
        const data = bpRows.map((r, i) => {
          const key = `${r.ten_chi_tiet}|||${r.noi_phat_sinh}`;
          const st = statusData[key] || {};
          return [
            i + 1,
            r.ten_chi_tiet,
            (r.so_files || []).join(", "),
            r.so_lan_loi,
            (r.ma_loi_counts || []).map(m => `${m.code} (${m.count})`).join(", "),
            (r.order_kds || []).join(", "),
            (r.day_mays || []).join(", "),
            st.tinh_trang || "",
            st.ngay_yeu_cau ? dayjs(st.ngay_yeu_cau).format("DD/MM/YYYY") : "",
            st.thoi_han ? dayjs(st.thoi_han).format("DD/MM/YYYY") : "",
            st.ngay_hoan_thanh ? dayjs(st.ngay_hoan_thanh).format("DD/MM/YYYY") : "",
          ];
        });
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        ws["!cols"] = headers.map((h, i) => ({
          wch: Math.max(h.length, ...data.slice(0, 50).map(r => String(r[i] || "").length), 8),
        }));
        XLSX.utils.book_append_sheet(wb, ws, bp.label);
      }

      XLSX.writeFile(wb, `Theo_doi_don_hang_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  }, [allFilteredNoBp, statusData]);

  useImperativeHandle(ref, () => ({ exportExcel }), [exportExcel]);

  /* ── Cột dữ liệu ── */
  const columns = useMemo(() => [
    {
      field: "ten_chi_tiet", headerName: "Tên chi tiết", minWidth: 160, width: 180,
      renderCell: (p) => (
        <span style={{ color: "#1e40af", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.value}>
          {p.value || "—"}
        </span>
      ),
    },
    {
      field: "so_files", headerName: "Số file", minWidth: 120, width: 120, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center", overflow: "hidden" }} title={arr.join(", ")}>
            <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: "#e0f2fe", color: "#0369a1", whiteSpace: "nowrap" }}>{arr[0]}</span>
            {arr.length > 1 && <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>+{arr.length - 1}</span>}
          </div>
        );
      },
    },
    {
      field: "noi_phat_sinh", headerName: "Nơi phát sinh", minWidth: 140, width: 140, align: "center", headerAlign: "center",
      renderCell: (p) => <NoiXuLyBadge value={p.value} />,
    },
    {
      field: "so_lan_loi", headerName: "Số lần lỗi", minWidth: 120, width: 120, type: "number", align: "center", headerAlign: "center",
      renderCell: (p) => {
        const v = p.value || 0;
        let bg = "#fef3c7", color = "#92400e";
        if (v >= 5) { bg = "#fee2e2"; color = "#991b1b"; }
        return <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: bg, color, minWidth: 28, textAlign: "center" }}>{v}</span>;
      },
    },
    {
      field: "ma_loi_counts", headerName: "Mã lỗi (số lần)", minWidth: 350, flex: 2, sortable: false,
      renderCell: (p) => {
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", overflow: "hidden", alignItems: "center" }}>
            {arr.map(({ code, count }) => <MaLoiCountBadge key={code} code={code} count={count} />)}
          </div>
        );
      },
    },
    {
      field: "order_kds", headerName: "Các Order KD", minWidth: 200, flex: 1, sortable: false,
      renderCell: (p) => {
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", overflow: "hidden", alignItems: "center" }}>
            {arr.map(o => (
              <span key={o} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: "#f1f5f9", color: "#334155", whiteSpace: "nowrap", border: "1px solid #e2e8f0" }}>{o}</span>
            ))}
          </div>
        );
      },
    },
    {
      field: "day_mays", headerName: "Dãy máy gia công", minWidth: 150, width: 150, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 3, flexWrap: "nowrap", justifyContent: "center", overflow: "hidden" }}>
            {arr.map(v => {
              const c = getDayMayColor(v);
              return <span key={v} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: c.bg, color: c.color, whiteSpace: "nowrap" }}>{v}</span>;
            })}
          </div>
        );
      },
    },
    {
      field: "tinh_trang", headerName: "Tình trạng báo lỗi", minWidth: 180, width: 180, sortable: false,
      renderCell: (p) => {
        const key = `${p.row.ten_chi_tiet}|||${p.row.noi_phat_sinh}`;
        const val = statusData[key]?.tinh_trang || null;
        const color = val === "Yêu cầu báo lỗi" ? "#d97706" : val === "Hoàn thành báo lỗi" ? "#059669" : undefined;

        const doChange = (v) => {
          const fields = { tinh_trang: v || null };
          if (!v) {
            fields.ngay_yeu_cau = null;
            fields.ngay_hoan_thanh = null;
          } else {
            const today = dayjs().format("YYYY-MM-DD");
            if (v === "Yêu cầu báo lỗi") fields.ngay_yeu_cau = today;
            if (v === "Hoàn thành báo lỗi") fields.ngay_hoan_thanh = today;
          }
          updateStatusBatch(key, fields);
        };

        return (
          <Select
            size="small" allowClear
            value={val}
            onChange={v => requirePassword(() => doChange(v))}
            onClear={() => requirePassword(() => doChange(null))}
            placeholder={isUnlocked ? "Chọn..." : "🔒 Chọn..."}
            style={{ width: "100%", ...(color ? { fontWeight: 600 } : {}) }}
            onClick={e => e.stopPropagation()}
            popupMatchSelectWidth={false}
            options={[
              { label: <span style={{ color: "#d97706", fontWeight: 600 }}>Yêu cầu báo lỗi</span>, value: "Yêu cầu báo lỗi" },
              { label: <span style={{ color: "#059669", fontWeight: 600 }}>Hoàn thành báo lỗi</span>, value: "Hoàn thành báo lỗi" },
            ]}
          />
        );
      },
    },
    {
      field: "ngay_yeu_cau", headerName: "Ngày yêu cầu", minWidth: 120, width: 120, sortable: false, align: "center", headerAlign: "center",
      renderCell: (p) => {
        const key = `${p.row.ten_chi_tiet}|||${p.row.noi_phat_sinh}`;
        const val = statusData[key]?.ngay_yeu_cau;
        return <span style={{ fontSize: 12, color: val ? "#1e293b" : "#d1d5db" }}>{val ? dayjs(val).format("DD/MM/YYYY") : "—"}</span>;
      },
    },
    {
      field: "thoi_han", headerName: "Thời hạn", minWidth: 140, width: 140, sortable: false, align: "center", headerAlign: "center",
      renderCell: (p) => {
        const key = `${p.row.ten_chi_tiet}|||${p.row.noi_phat_sinh}`;
        const val = statusData[key]?.thoi_han;
        const parsedVal = val ? dayjs(val) : null;

        // Kiểm tra quá hạn
        const isOverdue = parsedVal && parsedVal.isValid() && parsedVal.isBefore(dayjs(), 'day') && statusData[key]?.tinh_trang !== "Hoàn thành báo lỗi";

        const doChange = (date) => {
          updateStatus(key, "thoi_han", date ? date.format("YYYY-MM-DD") : null);
        };

        return (
          <DatePicker
            size="small"
            value={parsedVal && parsedVal.isValid() ? parsedVal : null}
            onChange={date => requirePassword(() => doChange(date))}
            format="DD/MM/YYYY"
            placeholder={isUnlocked ? "Chọn..." : "🔒"}
            allowClear
            onClear={() => requirePassword(() => doChange(null))}
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%",
              ...(isOverdue ? { borderColor: "#dc2626" } : {}),
            }}
            status={isOverdue ? "error" : undefined}
          />
        );
      },
    },
    {
      field: "ngay_hoan_thanh", headerName: "Ngày hoàn thành", minWidth: 145, width: 145, sortable: false, align: "center", headerAlign: "center",
      renderCell: (p) => {
        const key = `${p.row.ten_chi_tiet}|||${p.row.noi_phat_sinh}`;
        const val = statusData[key]?.ngay_hoan_thanh;
        return <span style={{ fontSize: 12, color: val ? "#059669" : "#d1d5db", fontWeight: val ? 600 : 400 }}>{val ? dayjs(val).format("DD/MM/YYYY") : "—"}</span>;
      },
    },
  ], [statusData, updateStatus, updateStatusBatch, requirePassword, isUnlocked]);

  /* ── Cấu hình giao diện bảng ── */
  const gridSx = {
    border: "none", fontSize: 13,
    fontFamily: "var(--font-inter), Inter, sans-serif",
    "& .MuiDataGrid-columnHeaders": {
      backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0",
      minHeight: "38px !important", maxHeight: "38px !important",
    },
    "& .MuiDataGrid-columnHeader": {
      padding: "0 10px", "&:hover": { backgroundColor: "#f1f5f9" },
    },
    "& .MuiDataGrid-columnHeaderTitle": {
      fontWeight: 500, fontSize: 13, color: "#111827",
      textTransform: "none", letterSpacing: "0.01em",
      overflow: "visible", textOverflow: "unset", whiteSpace: "nowrap",
    },
    "& .MuiDataGrid-sortIcon": { opacity: "1 !important", color: "#475569", fontSize: 15 },
    "& .MuiDataGrid-columnSeparator": { display: "none" },
    "& .MuiDataGrid-row": {
      borderBottom: "1px solid #f1f5f9",
      "&:hover": { backgroundColor: "#f0f7ff" },
      "&:nth-of-type(even)": { backgroundColor: "#fafbfd" },
    },
    "& .MuiDataGrid-cell": {
      borderBottom: "none", display: "flex", alignItems: "center", padding: "0 10px",
    },
    "& .MuiDataGrid-footerContainer": {
      borderTop: "2px solid #e2e8f0", minHeight: 40, backgroundColor: "#f8fafc",
    },
    "& .MuiTablePagination-displayedRows": { fontSize: 13, color: "#64748b" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "#f1f5f9" }}>

      {/* ── Filter toolbar ── */}
      <div className="filter-toolbar" style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "6px 16px", background: "#fff", borderBottom: "1px solid #f0f0f0",
      }}>
        <Input
          placeholder="Tìm tên chi tiết, order, mã lỗi..."
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
            onClick={clearAllFilters} style={{ padding: "0 6px", fontSize: 12 }}>Xóa lọc</Button>
        )}
        <div style={{ flex: 1 }} />
        <Button size="small" icon={<DownloadOutlined />} onClick={exportExcel}>Xuất Excel</Button>
      </div>

      {/* ── Summary cards ── */}
      <div className="bp-cards-grid" style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
        padding: "12px 16px",
      }}>
        {BO_PHAN_LIST.map(bp => {
          const st = boPhanStats[bp.key] || { count: 0, slLoi: 0, loiTon: 0 };
          const isActive = boPhan === bp.key;
          return (
            <div
              key={bp.key}
              onClick={() => setBoPhan(boPhan === bp.key ? "all" : bp.key)}
              style={{
                background: "#fff",
                borderRadius: 10,
                padding: "12px 16px",
                cursor: "pointer",
                border: isActive ? `2px solid ${bp.color}` : "2px solid transparent",
                boxShadow: isActive ? `0 0 0 3px ${bp.color}15` : "0 1px 3px rgba(0,0,0,0.06)",
                transition: "all 0.2s",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Thanh nhấn màu */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 3,
                background: bp.gradient,
              }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{bp.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: bp.color }}>{bp.label}</span>
                </div>
                <span style={{
                  fontSize: 20, fontWeight: 800, color: bp.color,
                }}>{st.count}</span>
              </div>

              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6b7280" }}>
                <div>
                  <span style={{ color: "#9ca3af" }}>SL lỗi </span>
                  <b style={{ color: "#dc2626" }}>{st.slLoi.toLocaleString()}</b>
                </div>
                <div>
                  <span style={{ color: "#9ca3af" }}>Tồn </span>
                  <b style={{ color: st.loiTon > 0 ? "#dc2626" : "#059669" }}>{st.loiTon.toLocaleString()}</b>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Table header ── */}
      <div className="table-header" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 16px", background: "#fff", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
            {boPhan === "all" ? "Tất cả bộ phận" : `Bộ phận: ${boPhan}`}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 10,
            background: "#dbeafe", color: "#1e40af",
          }}>{orderRows.length} đơn hàng</span>
          {boPhan !== "all" && (
            <button
              onClick={() => setBoPhan("all")}
              style={{
                fontSize: 11, color: "#6b7280", background: "#f3f4f6", border: "none",
                padding: "2px 8px", borderRadius: 4, cursor: "pointer",
              }}
            >✕ Bỏ lọc</button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            Chỉ hiển thị đơn hàng có ≥{minLanLoi} lần báo lỗi
          </span>
          <div style={{ width: 1, height: 16, background: "#e2e8f0" }} />
          {isUnlocked ? (
            <Tooltip title="Đã mở khóa — nhấn để đổi mật khẩu">
              <Button
                size="small" type="text"
                icon={<UnlockOutlined style={{ color: "#059669" }} />}
                onClick={() => {
                  setChangePwOld(""); setChangePwNew(""); setChangePwConfirm(""); setChangePwError("");
                  setShowChangePwModal(true);
                }}
                style={{ fontSize: 11, color: "#059669" }}
              >
                Đổi mật khẩu
              </Button>
            </Tooltip>
          ) : (
            <Tooltip title="Nhấn để mở khóa chỉnh sửa">
              <Button
                size="small" type="text"
                icon={<LockOutlined style={{ color: "#d97706" }} />}
                onClick={() => { setPwInput(""); setPwError(false); setShowPwModal(true); }}
                style={{ fontSize: 11, color: "#d97706" }}
              >
                Mở khóa
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* ── DataGrid ── */}
      <div className="datagrid-wrapper" style={{
        flex: 1, minHeight: 0, background: "#fff",
        opacity: isFiltering ? 0.6 : 1, transition: "opacity 0.15s",
      }}>
        <DataGrid
          rows={orderRows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={isLoading}
          localeText={viVN.components.MuiDataGrid.defaultProps.localeText}
          disableColumnMenu
          disableColumnReorder
          pageSizeOptions={[50, 100, 200]}
          initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
          disableRowSelectionOnClick
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          disableMultipleColumnsSorting
          density="compact"
          sx={gridSx}
        />
      </div>

      {/* ── Hộp thoại mật khẩu ── */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LockOutlined style={{ color: "#d97706" }} />
            <span>Nhập mật khẩu để chỉnh sửa</span>
          </div>
        }
        open={showPwModal}
        onOk={handlePwSubmit}
        onCancel={() => { setShowPwModal(false); setPwInput(""); setPwError(false); pendingAction.current = null; }}
        okText="Xác nhận"
        cancelText="Hủy"
        width={380}
        centered
        destroyOnHidden
      >
        <div style={{ padding: "12px 0" }}>
          <p style={{ marginBottom: 12, fontSize: 13, color: "#6b7280" }}>
            Cột "Tình trạng báo lỗi" được bảo vệ. Vui lòng nhập mật khẩu để tiếp tục.
          </p>
          <Input.Password
            placeholder="Nhập mật khẩu..."
            value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwError(false); }}
            onPressEnter={handlePwSubmit}
            status={pwError ? "error" : undefined}
            autoFocus
            style={{ borderRadius: 8 }}
          />
          {pwError && (
            <p style={{ color: "#dc2626", fontSize: 12, marginTop: 6, marginBottom: 0 }}>
              Mật khẩu không đúng. Vui lòng thử lại.
            </p>
          )}
        </div>
      </Modal>

      {/* ── Hộp thoại đổi mật khẩu ── */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SettingOutlined style={{ color: "#2563eb" }} />
            <span>Đổi mật khẩu</span>
          </div>
        }
        open={showChangePwModal}
        onOk={handleChangePwSubmit}
        onCancel={() => { setShowChangePwModal(false); setChangePwOld(""); setChangePwNew(""); setChangePwConfirm(""); setChangePwError(""); }}
        okText="Đổi mật khẩu"
        cancelText="Hủy"
        width={400}
        centered
        destroyOnHidden
      >
        <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>Mật khẩu hiện tại</label>
            <Input.Password
              placeholder="Nhập mật khẩu hiện tại..."
              value={changePwOld}
              onChange={e => { setChangePwOld(e.target.value); setChangePwError(""); }}
              style={{ borderRadius: 8 }}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>Mật khẩu mới</label>
            <Input.Password
              placeholder="Nhập mật khẩu mới (tối thiểu 4 ký tự)..."
              value={changePwNew}
              onChange={e => { setChangePwNew(e.target.value); setChangePwError(""); }}
              style={{ borderRadius: 8 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>Xác nhận mật khẩu mới</label>
            <Input.Password
              placeholder="Nhập lại mật khẩu mới..."
              value={changePwConfirm}
              onChange={e => { setChangePwConfirm(e.target.value); setChangePwError(""); }}
              onPressEnter={handleChangePwSubmit}
              style={{ borderRadius: 8 }}
            />
          </div>
          {changePwError && (
            <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>
              {changePwError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
});

export default TheoDoiDonHang;
