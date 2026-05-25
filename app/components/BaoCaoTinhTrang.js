"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { DataGrid } from "@mui/x-data-grid";
import { viVN } from "@mui/x-data-grid/locales";
import { Input, Select, Button, Tag, Tooltip, Modal, Checkbox, App as AntApp } from "antd";
import { SearchOutlined, ClearOutlined, DownloadOutlined, LockOutlined, UnlockOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

/* ── Password protection (shared with TheoDoiDonHang) ── */
const DEFAULT_PASSWORD = "admin123";
const PW_LS_KEY = "theodoi_edit_password";

function getSavedPassword() {
  try {
    return localStorage.getItem(PW_LS_KEY) || DEFAULT_PASSWORD;
  } catch { return DEFAULT_PASSWORD; }
}

/* ── Status config ── */
const STATUS_CONFIG = {
  "Yêu cầu báo lỗi": { color: "#d97706", bg: "#fffbeb", border: "#fbbf2440", icon: "📋" },
  "Hoàn thành báo lỗi": { color: "#059669", bg: "#ecfdf5", border: "#10b98140", icon: "✅" },
};

const BO_PHAN_CONFIG = {
  PSX: { label: "PSX", icon: "🏭", color: "#92400e", bg: "#fffbeb", gradient: "linear-gradient(135deg, #fbbf24, #f59e0b)" },
  PKT: { label: "PKT", icon: "🔧", color: "#1e40af", bg: "#eff6ff", gradient: "linear-gradient(135deg, #60a5fa, #3b82f6)" },
  PKY: { label: "PKY", icon: "⚙️", color: "#5b21b6", bg: "#f5f3ff", gradient: "linear-gradient(135deg, #a78bfa, #8b5cf6)" },
  "Phôi": { label: "Phôi", icon: "📦", color: "#9d174d", bg: "#fdf2f8", gradient: "linear-gradient(135deg, #f472b6, #ec4899)" },
};

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

/* ════════════════════════════════════════ */
export default function BaoCaoTinhTrang({ rows: processedRows }) {
  const { message } = AntApp.useApp();
  const [statusData, setStatusData] = useState({});
  const [search, setSearch] = useState("");
  const [filterBoPhan, setFilterBoPhan] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [sortModel, setSortModel] = useState([]);

  /* ── Password protection ── */
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const pendingAction = useRef(null);

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
      message.success("Đã mở khóa! Bạn có thể sử dụng chức năng Loại bỏ.");
      if (pendingAction.current) {
        pendingAction.current();
        pendingAction.current = null;
      }
    } else {
      setPwError(true);
    }
  }, [pwInput, message]);

  // Fetch status from server API
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/status");
        const json = await res.json();
        if (json.ok && json.data) setStatusData(json.data);
      } catch { /* ignore */ }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  /* ── Update status helper ── */
  const updateStatus = useCallback((rowKey, field, value) => {
    // Optimistic update
    setStatusData(prev => {
      const next = { ...prev, [rowKey]: { ...(prev[rowKey] || {}), [field]: value } };
      return next;
    });
    // Persist to server
    fetch("/api/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: rowKey, field, value }),
    }).catch(() => { /* ignore */ });
  }, []);

  /* ── Build report rows from statusData ── */
  const reportRows = useMemo(() => {
    const result = [];
    let idx = 0;

    for (const [key, data] of Object.entries(statusData)) {
      if (!data.tinh_trang && !data.thoi_han) continue; // skip empty entries

      const [tenChiTiet, noiPhatSinh] = key.split("|||");
      if (!tenChiTiet) continue;

      // Find matching processed row for so_lan_loi
      const matchedRow = processedRows?.find(
        r => r.ten_chi_tiet === tenChiTiet &&
          r.entries?.some(e => e.noi_phat_sinh_loi === noiPhatSinh)
      );

      const thoiHan = data.thoi_han ? dayjs(data.thoi_han) : null;
      const ngayHoanThanh = data.ngay_hoan_thanh ? dayjs(data.ngay_hoan_thanh) : null;
      const ngayYeuCau = data.ngay_yeu_cau ? dayjs(data.ngay_yeu_cau) : null;

      // Determine overdue status
      let trangThaiThoiHan = null;
      if (thoiHan && thoiHan.isValid()) {
        if (data.tinh_trang === "Hoàn thành báo lỗi") {
          if (ngayHoanThanh && ngayHoanThanh.isValid()) {
            trangThaiThoiHan = ngayHoanThanh.isAfter(thoiHan, "day") ? "Trễ hạn" : "Đúng hạn";
          } else {
            trangThaiThoiHan = "Đúng hạn";
          }
        } else {
          trangThaiThoiHan = thoiHan.isBefore(dayjs(), "day") ? "Quá hạn" : "Trong hạn";
        }
      }

      // Extract unique so_file values
      const soFiles = matchedRow?.ngay_nhans
        ? [...new Set(matchedRow.ngay_nhans.map(n => n.so_file).filter(Boolean))]
        : [];

      result.push({
        id: idx++,
        key,
        ten_chi_tiet: tenChiTiet,
        noi_phat_sinh: noiPhatSinh,
        tinh_trang: data.tinh_trang || "",
        ngay_yeu_cau: data.ngay_yeu_cau || null,
        thoi_han: data.thoi_han || null,
        ngay_hoan_thanh: data.ngay_hoan_thanh || null,
        loai_bo: data.loai_bo || false,
        trang_thai_thoi_han: trangThaiThoiHan,
        so_lan_loi: matchedRow?.so_lan_loi || null,
        day_mays: matchedRow?.day_mays || [],
        so_files: soFiles,
        _searchText: `${tenChiTiet} ${noiPhatSinh}`.toLowerCase(),
      });
    }

    // Sort: quá hạn first, then yêu cầu, then hoàn thành
    result.sort((a, b) => {
      const order = { "Quá hạn": 0, "Trong hạn": 1, "Trễ hạn": 2, "Đúng hạn": 3 };
      const oa = order[a.trang_thai_thoi_han] ?? 4;
      const ob = order[b.trang_thai_thoi_han] ?? 4;
      if (oa !== ob) return oa - ob;
      // Then by status: yêu cầu first
      if (a.tinh_trang !== b.tinh_trang) {
        if (a.tinh_trang === "Yêu cầu báo lỗi") return -1;
        if (b.tinh_trang === "Yêu cầu báo lỗi") return 1;
      }
      return a.ten_chi_tiet.localeCompare(b.ten_chi_tiet);
    });

    return result;
  }, [statusData, processedRows]);

  /* ── Filtered rows ── */
  const filteredRows = useMemo(() => {
    let data = reportRows;
    if (filterBoPhan) data = data.filter(r => r.noi_phat_sinh === filterBoPhan);
    if (filterStatus) data = data.filter(r => r.tinh_trang === filterStatus);
    if (search.trim()) {
      const s = search.toLowerCase();
      data = data.filter(r => r._searchText.includes(s));
    }
    return data;
  }, [reportRows, filterBoPhan, filterStatus, search]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const total = reportRows.length;
    const yeuCau = reportRows.filter(r => r.tinh_trang === "Yêu cầu báo lỗi").length;
    const hoanThanh = reportRows.filter(r => r.tinh_trang === "Hoàn thành báo lỗi").length;
    const quaHan = reportRows.filter(r => r.trang_thai_thoi_han === "Quá hạn").length;
    const treHan = reportRows.filter(r => r.trang_thai_thoi_han === "Trễ hạn").length;
    const dungHan = reportRows.filter(r => r.trang_thai_thoi_han === "Đúng hạn").length;
    const trongHan = reportRows.filter(r => r.trang_thai_thoi_han === "Trong hạn").length;
    const chuaCoThoiHan = reportRows.filter(r => !r.trang_thai_thoi_han).length;

    // Stats per bộ phận
    const byBoPhan = {};
    for (const bp of Object.keys(BO_PHAN_CONFIG)) {
      const bpRows = reportRows.filter(r => r.noi_phat_sinh === bp);
      byBoPhan[bp] = {
        total: bpRows.length,
        yeuCau: bpRows.filter(r => r.tinh_trang === "Yêu cầu báo lỗi").length,
        hoanThanh: bpRows.filter(r => r.tinh_trang === "Hoàn thành báo lỗi").length,
        quaHan: bpRows.filter(r => r.trang_thai_thoi_han === "Quá hạn").length,
      };
    }

    return { total, yeuCau, hoanThanh, quaHan, treHan, dungHan, trongHan, chuaCoThoiHan, byBoPhan };
  }, [reportRows]);

  /* ── Export Excel ── */
  const exportExcel = useCallback(() => {
    import("xlsx").then(XLSX => {
      const wb = XLSX.utils.book_new();
      const headers = ["STT", "Tên chi tiết", "Số file", "Vị trí", "Dãy máy gia công", "Tình trạng báo lỗi", "Ngày yêu cầu", "Thời hạn", "Ngày hoàn thành", "Trạng thái thời hạn", "Loại bỏ"];
      const data = filteredRows.map((r, i) => [
        i + 1,
        r.ten_chi_tiet,
        (r.so_files || []).join(", "),
        r.noi_phat_sinh,
        (r.day_mays || []).join(", "),
        r.tinh_trang,
        r.ngay_yeu_cau ? dayjs(r.ngay_yeu_cau).format("DD/MM/YYYY") : "",
        r.thoi_han ? dayjs(r.thoi_han).format("DD/MM/YYYY") : "",
        r.ngay_hoan_thanh ? dayjs(r.ngay_hoan_thanh).format("DD/MM/YYYY") : "",
        r.trang_thai_thoi_han || "",
        r.loai_bo ? "Có" : "",
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      ws["!cols"] = headers.map((h, i) => ({
        wch: Math.max(h.length, ...data.slice(0, 50).map(r => String(r[i] || "").length), 8),
      }));
      XLSX.utils.book_append_sheet(wb, ws, "Báo cáo tình trạng");
      XLSX.writeFile(wb, `Bao_cao_tinh_trang_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  }, [filteredRows]);

  /* ── Columns ── */
  const columns = useMemo(() => [
    {
      field: "ten_chi_tiet", headerName: "Tên chi tiết", minWidth: 180, flex: 1,
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
        if (!arr.length) return <span style={{ color: "#d1d5db" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center", overflow: "hidden" }} title={arr.join(", ")}>
            <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: "#e0f2fe", color: "#0369a1", whiteSpace: "nowrap" }}>{arr[0]}</span>
            {arr.length > 1 && <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>+{arr.length - 1}</span>}
          </div>
        );
      },
    },
    {
      field: "day_mays", headerName: "Dãy máy gia công", minWidth: 150, width: 150, align: "center", headerAlign: "center",
      sortable: false,
      renderCell: (p) => {
        const arr = p.value || [];
        if (!arr.length) return <span style={{ color: "#d1d5db" }}>—</span>;
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
      field: "noi_phat_sinh", headerName: "Vị trí", minWidth: 120, width: 120, align: "center", headerAlign: "center",
      renderCell: (p) => {
        const bp = BO_PHAN_CONFIG[p.value];
        if (!bp) return <span style={{ color: "#9ca3af" }}>{p.value || "—"}</span>;
        return (
          <span style={{
            padding: "2px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: bp.bg, color: bp.color, border: `1px solid ${bp.color}20`,
          }}>
            {bp.icon} {bp.label}
          </span>
        );
      },
    },
    {
      field: "tinh_trang", headerName: "Tình trạng báo lỗi", minWidth: 190, width: 190, align: "center", headerAlign: "center",
      renderCell: (p) => {
        const cfg = STATUS_CONFIG[p.value];
        if (!cfg) return <span style={{ color: "#d1d5db" }}>—</span>;
        return (
          <span style={{
            padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
            whiteSpace: "nowrap",
          }}>
            {cfg.icon} {p.value}
          </span>
        );
      },
    },
    {
      field: "ngay_yeu_cau", headerName: "Ngày yêu cầu", minWidth: 130, width: 130, align: "center", headerAlign: "center",
      renderCell: (p) => {
        const val = p.value;
        return <span style={{ fontSize: 12, color: val ? "#1e293b" : "#d1d5db" }}>{val ? dayjs(val).format("DD/MM/YYYY") : "—"}</span>;
      },
    },
    {
      field: "thoi_han", headerName: "Thời hạn", minWidth: 130, width: 130, align: "center", headerAlign: "center",
      renderCell: (p) => {
        const val = p.value;
        if (!val) return <span style={{ color: "#d1d5db" }}>—</span>;
        const d = dayjs(val);
        const isOverdue = p.row.trang_thai_thoi_han === "Quá hạn";
        return (
          <span style={{
            fontSize: 12,
            color: isOverdue ? "#dc2626" : "#1e293b",
            fontWeight: isOverdue ? 700 : 400,
          }}>
            {d.format("DD/MM/YYYY")}
            {isOverdue && <span style={{ marginLeft: 4, fontSize: 10 }}>⚠️</span>}
          </span>
        );
      },
    },
    {
      field: "ngay_hoan_thanh", headerName: "Ngày hoàn thành", minWidth: 145, width: 145, align: "center", headerAlign: "center",
      renderCell: (p) => {
        const val = p.value;
        return (
          <span style={{
            fontSize: 12,
            color: val ? "#059669" : "#d1d5db",
            fontWeight: val ? 600 : 400,
          }}>
            {val ? dayjs(val).format("DD/MM/YYYY") : "—"}
          </span>
        );
      },
    },
    {
      field: "trang_thai_thoi_han", headerName: "Trạng thái", minWidth: 120, width: 120, align: "center", headerAlign: "center",
      renderCell: (p) => {
        const val = p.value;
        if (!val) return <span style={{ color: "#d1d5db" }}>—</span>;
        const cfg = {
          "Quá hạn": { bg: "#fee2e2", color: "#991b1b" },
          "Trong hạn": { bg: "#dbeafe", color: "#1e40af" },
          "Trễ hạn": { bg: "#fff7ed", color: "#c2410c" },
          "Đúng hạn": { bg: "#d1fae5", color: "#065f46" },
        }[val] || { bg: "#f3f4f6", color: "#4b5563" };
        return (
          <span style={{
            padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
            background: cfg.bg, color: cfg.color,
          }}>
            {val}
          </span>
        );
      },
    },
    {
      field: "loai_bo", headerName: "Loại bỏ", minWidth: 90, width: 90, align: "center", headerAlign: "center",
      sortable: true,
      renderCell: (p) => {
        const key = p.row.key;
        const checked = !!p.value;
        const handleChange = () => {
          requirePassword(() => {
            updateStatus(key, "loai_bo", !checked);
          });
        };
        return (
          <Tooltip title={isUnlocked ? (checked ? "Bỏ đánh dấu loại bỏ" : "Đánh dấu loại bỏ") : "🔒 Cần mở khóa"}>
            <div
              onClick={(e) => { e.stopPropagation(); handleChange(); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "100%", height: "100%", cursor: "pointer",
              }}
            >
              <Checkbox
                checked={checked}
                style={{
                  pointerEvents: "none",
                  ...(checked ? { } : {}),
                }}
              />
            </div>
          </Tooltip>
        );
      },
    },
  ], [requirePassword, updateStatus, isUnlocked]);

  /* ── Chart data for donut ── */
  const donutData = useMemo(() => {
    const segments = [];
    if (stats.yeuCau > 0) segments.push({ label: "Yêu cầu báo lỗi", value: stats.yeuCau, color: "#f59e0b" });
    if (stats.hoanThanh > 0) segments.push({ label: "Hoàn thành", value: stats.hoanThanh, color: "#10b981" });
    const noStatus = stats.total - stats.yeuCau - stats.hoanThanh;
    if (noStatus > 0) segments.push({ label: "Chưa xác định", value: noStatus, color: "#d1d5db" });
    return segments;
  }, [stats]);

  const deadlineDonutData = useMemo(() => {
    const segments = [];
    if (stats.quaHan > 0) segments.push({ label: "Quá hạn", value: stats.quaHan, color: "#ef4444" });
    if (stats.trongHan > 0) segments.push({ label: "Trong hạn", value: stats.trongHan, color: "#3b82f6" });
    if (stats.dungHan > 0) segments.push({ label: "Đúng hạn", value: stats.dungHan, color: "#10b981" });
    if (stats.treHan > 0) segments.push({ label: "Trễ hạn", value: stats.treHan, color: "#f97316" });
    if (stats.chuaCoThoiHan > 0) segments.push({ label: "Chưa có thời hạn", value: stats.chuaCoThoiHan, color: "#d1d5db" });
    return segments;
  }, [stats]);

  const hasFilter = !!search || !!filterBoPhan || !!filterStatus;

  return (
    <div className="baocao-container" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "#f8fafc" }}>

      {/* ── Summary Cards ── */}
      <div className="summary-cards" style={{ padding: "12px 16px", display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Total card */}
        <SummaryCard
          title="Tổng số" value={stats.total} icon="📊"
          gradient="linear-gradient(135deg, #667eea, #764ba2)"
          subtitle={`${stats.yeuCau} yêu cầu · ${stats.hoanThanh} hoàn thành`}
        />
        <SummaryCard
          title="Yêu cầu báo lỗi" value={stats.yeuCau} icon="📋"
          gradient="linear-gradient(135deg, #f59e0b, #d97706)"
          subtitle={stats.quaHan > 0 ? `${stats.quaHan} quá hạn!` : "Đang xử lý"}
          alert={stats.quaHan > 0}
        />
        <SummaryCard
          title="Hoàn thành" value={stats.hoanThanh} icon="✅"
          gradient="linear-gradient(135deg, #10b981, #059669)"
          subtitle={`${stats.dungHan} đúng hạn · ${stats.treHan} trễ hạn`}
        />
        <SummaryCard
          title="Quá hạn" value={stats.quaHan} icon="⚠️"
          gradient="linear-gradient(135deg, #ef4444, #dc2626)"
          subtitle="Cần xử lý gấp!"
          alert={stats.quaHan > 0}
        />
      </div>

      {/* ── Charts Section ── */}
      <div className="charts-section" style={{ padding: "0 16px 12px", display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Donut: Tình trạng */}
        <div style={{
          flex: 1, minWidth: 280, background: "#fff", borderRadius: 12, padding: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0",
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Tình trạng báo lỗi</h3>
          <DonutChart data={donutData} size={160} />
        </div>

        {/* Donut: Thời hạn */}
        <div style={{
          flex: 1, minWidth: 280, background: "#fff", borderRadius: 12, padding: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0",
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Tình trạng thời hạn</h3>
          <DonutChart data={deadlineDonutData} size={160} />
        </div>

        {/* Bar Chart: Theo bộ phận */}
        <div style={{
          flex: 1.5, minWidth: 360, background: "#fff", borderRadius: 12, padding: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0",
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Theo bộ phận</h3>
          <BarChart data={stats.byBoPhan} />
        </div>
      </div>

      {/* ── Filter toolbar ── */}
      <div className="filter-toolbar" style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "6px 16px", background: "#fff", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0",
      }}>
        <Input
          placeholder="Tìm tên chi tiết..."
          size="small" allowClear value={search}
          prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 220, borderRadius: 6 }}
        />
        <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
        <Select placeholder="Vị trí" allowClear value={filterBoPhan} size="small"
          onChange={v => setFilterBoPhan(v || null)} style={{ minWidth: 120 }}
          options={Object.entries(BO_PHAN_CONFIG).map(([k, v]) => ({ label: `${v.icon} ${v.label}`, value: k }))} />
        <Select placeholder="Tình trạng" allowClear value={filterStatus} size="small"
          onChange={v => setFilterStatus(v || null)} style={{ minWidth: 180 }}
          options={[
            { label: "📋 Yêu cầu báo lỗi", value: "Yêu cầu báo lỗi" },
            { label: "✅ Hoàn thành báo lỗi", value: "Hoàn thành báo lỗi" },
          ]} />
        {hasFilter && (
          <Button type="link" danger size="small" icon={<ClearOutlined />}
            onClick={() => { setSearch(""); setFilterBoPhan(null); setFilterStatus(null); }}
            style={{ padding: "0 6px", fontSize: 12 }}>Xóa lọc</Button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          Hiển thị <b style={{ color: "#111827" }}>{filteredRows.length}</b> / {reportRows.length} bản ghi
        </span>
        <div style={{ width: 1, height: 16, background: "#e2e8f0" }} />
        {isUnlocked ? (
          <Tooltip title="Đã mở khóa — cột Loại bỏ đang hoạt động">
            <Button
              size="small" type="text"
              icon={<UnlockOutlined style={{ color: "#059669" }} />}
              onClick={() => setIsUnlocked(false)}
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
              onClick={() => { setPwInput(""); setPwError(false); setShowPwModal(true); }}
              style={{ fontSize: 11, color: "#d97706" }}
            >
              Mở khóa
            </Button>
          </Tooltip>
        )}
        <Button size="small" icon={<DownloadOutlined />} onClick={exportExcel}>Xuất Excel</Button>
      </div>

      {/* ── DataGrid ── */}
      <div className="datagrid-wrapper baocao-datagrid" style={{ flex: 1, minHeight: 300, background: "#fff" }}>
        <DataGrid
          rows={filteredRows}
          columns={columns}
          getRowId={(row) => row.id}
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
          sx={{
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
          }}
        />
      </div>

      {/* ── Password Modal ── */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LockOutlined style={{ color: "#d97706" }} />
            <span>Nhập mật khẩu để sử dụng</span>
          </div>
        }
        open={showPwModal}
        onCancel={() => { setShowPwModal(false); setPwInput(""); setPwError(false); pendingAction.current = null; }}
        onOk={handlePwSubmit}
        okText="Xác nhận"
        cancelText="Hủy"
        centered
        width={380}
        okButtonProps={{ disabled: !pwInput }}
      >
        <div style={{ padding: "12px 0" }}>
          <p style={{ fontSize: 13, color: "#4b5563", marginBottom: 12 }}>
            Cột "Loại bỏ" được bảo vệ. Vui lòng nhập mật khẩu để tiếp tục.
          </p>
          <Input.Password
            placeholder="Nhập mật khẩu..."
            value={pwInput}
            onChange={e => setPwInput(e.target.value)}
            onPressEnter={handlePwSubmit}
            status={pwError ? "error" : undefined}
            autoFocus
          />
          {pwError && (
            <p style={{ color: "#dc2626", fontSize: 12, marginTop: 6 }}>
              Mật khẩu không đúng. Vui lòng thử lại.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════ */
/* ── Summary Card ── */
function SummaryCard({ title, value, icon, gradient, subtitle, alert }) {
  return (
    <div style={{
      flex: 1, minWidth: 200, borderRadius: 12, padding: 16, position: "relative",
      background: "#fff", border: alert ? "2px solid #fca5a5" : "1px solid #e2e8f0",
      boxShadow: alert ? "0 0 0 3px #fecaca40" : "0 1px 3px rgba(0,0,0,0.06)",
      overflow: "hidden", transition: "all 0.2s",
    }}>
      {/* Gradient accent */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: gradient }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{icon} {title}</span>
        <span style={{ fontSize: 28, fontWeight: 800, color: "#1e293b" }}>{value}</span>
      </div>
      <span style={{ fontSize: 11, color: alert ? "#dc2626" : "#9ca3af", fontWeight: alert ? 600 : 400 }}>{subtitle}</span>
    </div>
  );
}

/* ── Donut Chart (Pure CSS/SVG) ── */
function DonutChart({ data, size = 160 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: size, color: "#d1d5db", fontSize: 13 }}>
        Chưa có dữ liệu
      </div>
    );
  }

  const strokeWidth = 28;
  const radius = (size / 2) - strokeWidth / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Build segments with cumulative offset
  let cumulativeOffset = 0;
  const segments = data.map(d => {
    const pct = d.value / total;
    const dashLen = pct * circumference;
    const seg = { ...d, dashLen, offset: cumulativeOffset };
    cumulativeOffset += dashLen;
    return seg;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth}
        />
        {/* Segments — drawn as circles with dasharray */}
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${seg.dashLen} ${circumference - seg.dashLen}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease" }}
          />
        ))}
        {/* Center text */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={22} fontWeight={800} fill="#1e293b">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="#9ca3af">Tổng</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
            <span style={{ color: "#4b5563", whiteSpace: "nowrap" }}>{d.label}</span>
            <b style={{ color: "#1e293b" }}>{d.value}</b>
            <span style={{ color: "#9ca3af", fontSize: 11 }}>({total > 0 ? Math.round(d.value / total * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Bar Chart (Pure CSS) ── */
function BarChart({ data }) {
  const bpKeys = Object.keys(BO_PHAN_CONFIG);
  const maxVal = Math.max(1, ...bpKeys.map(k => data[k]?.total || 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {bpKeys.map(bp => {
        const d = data[bp] || { total: 0, yeuCau: 0, hoanThanh: 0, quaHan: 0 };
        const cfg = BO_PHAN_CONFIG[bp];
        const pct = maxVal > 0 ? (d.total / maxVal) * 100 : 0;

        return (
          <div key={bp}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>
                {cfg.icon} {cfg.label}
              </span>
              <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
                <span style={{ color: "#f59e0b" }}>📋 {d.yeuCau}</span>
                <span style={{ color: "#10b981" }}>✅ {d.hoanThanh}</span>
                {d.quaHan > 0 && <span style={{ color: "#ef4444", fontWeight: 700 }}>⚠️ {d.quaHan}</span>}
              </div>
            </div>
            <div style={{ height: 24, background: "#f1f5f9", borderRadius: 6, overflow: "hidden", position: "relative" }}>
              {/* Hoàn thành portion */}
              {d.hoanThanh > 0 && (
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: `${(d.hoanThanh / maxVal) * 100}%`,
                  background: "linear-gradient(90deg, #10b981, #34d399)",
                  borderRadius: 6, transition: "width 0.5s ease",
                  zIndex: 1,
                }} />
              )}
              {/* Yêu cầu portion (stacked) */}
              {d.yeuCau > 0 && (
                <div style={{
                  position: "absolute", left: `${(d.hoanThanh / maxVal) * 100}%`, top: 0, bottom: 0,
                  width: `${(d.yeuCau / maxVal) * 100}%`,
                  background: d.quaHan > 0 ? "linear-gradient(90deg, #f59e0b, #ef4444)" : "linear-gradient(90deg, #f59e0b, #fbbf24)",
                  borderRadius: d.hoanThanh > 0 ? "0 6px 6px 0" : 6,
                  transition: "width 0.5s ease",
                  zIndex: 1,
                }} />
              )}
              {/* Value label */}
              <span style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                fontSize: 12, fontWeight: 700, color: pct > 60 ? "#fff" : "#374151",
                zIndex: 2,
              }}>
                {d.total}
              </span>
            </div>
          </div>
        );
      })}
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b7280" }}>
          <span style={{ width: 12, height: 8, borderRadius: 2, background: "#10b981" }} /> Hoàn thành
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b7280" }}>
          <span style={{ width: 12, height: 8, borderRadius: 2, background: "#f59e0b" }} /> Yêu cầu
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b7280" }}>
          <span style={{ width: 12, height: 8, borderRadius: 2, background: "#ef4444" }} /> Quá hạn
        </div>
      </div>
    </div>
  );
}
