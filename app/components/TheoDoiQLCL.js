"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Select, Button, Spin, Modal, Empty, Tag, Tooltip, DatePicker, App as AntApp } from "antd";
import dayjs from "dayjs";
import {
  PlusOutlined, CloseOutlined, ReloadOutlined,
  UserOutlined, ShoppingOutlined, TeamOutlined,
  DownOutlined, UpOutlined,
} from "@ant-design/icons";

/* ── CSS Responsive (được thêm một lần) ── */
const QLCL_STYLE_ID = "qlcl-responsive-style";
if (typeof window !== "undefined" && !document.getElementById(QLCL_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = QLCL_STYLE_ID;
  style.textContent = `
    @media (max-width: 768px) {
      .qlcl-header {
        flex-direction: column !important;
        gap: 6px !important;
        align-items: flex-start !important;
        padding: 8px 12px !important;
      }
      .qlcl-header-title { font-size: 13px !important; }
      .qlcl-grid {
        grid-template-columns: 1fr !important;
        gap: 8px !important;
        padding: 8px !important;
        flex: none !important;
        overflow: visible !important;
      }
      .qlcl-ban-container {
        overflow: visible !important;
      }
      .qlcl-nv-list {
        overflow: visible !important;
        flex: none !important;
      }
      .qlcl-ban-header { padding: 8px 10px !important; }
      .qlcl-nv-card { overflow: visible !important; }
      .qlcl-nv-header {
        flex-wrap: wrap !important;
        padding: 6px 8px !important;
        gap: 4px !important;
      }
      .qlcl-nv-avatar {
        width: 26px !important;
        height: 26px !important;
        font-size: 10px !important;
      }
      .qlcl-nv-info > div:first-child {
        font-size: 12px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        max-width: 140px !important;
      }
      .qlcl-order-row {
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 2px !important;
        padding: 4px 6px !important;
      }
      .qlcl-order-info {
        width: 100% !important;
        flex-wrap: wrap !important;
        gap: 3px !important;
      }
      .qlcl-order-info span {
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .qlcl-order-meta {
        width: 100% !important;
        justify-content: flex-start !important;
      }
    }
    @media (min-width: 769px) and (max-width: 1024px) {
      .qlcl-grid { grid-template-columns: 1fr 1fr !important; }
    }
  `;
  document.head.appendChild(style);
}

/* ── Trạng thái chưa hoàn thành ── */
const COMPLETED_STATES = new Set([
  "Hoàn thành", "Gói - Kết thúc",
]);

function isActive(ghi_trang_thai, thoi_gian_hoan_thanh) {
  if (thoi_gian_hoan_thanh) return false; // đã có thời gian hoàn thành → xong
  return ghi_trang_thai && !COMPLETED_STATES.has(ghi_trang_thai);
}

/* ── Màu trạng thái ── */
function getTrangThaiStyle(tt) {
  if (!tt) return { bg: "#f3f4f6", color: "#6b7280" };
  const vl = tt.toLowerCase();
  if (vl.includes("ktra") || vl.includes("kiểm tra"))
    return { bg: "#dbeafe", color: "#1e40af" };
  if (vl.includes("tap"))
    return { bg: "#fef3c7", color: "#92400e" };
  if (vl.includes("via"))
    return { bg: "#ede9fe", color: "#5b21b6" };
  if (vl.includes("rửa") || vl.includes("rua"))
    return { bg: "#d1fae5", color: "#065f46" };
  if (vl.includes("gói") || vl.includes("goi"))
    return { bg: "#fce7f3", color: "#9d174d" };
  if (vl.includes("báo lỗi") || vl.includes("lỗi"))
    return { bg: "#fee2e2", color: "#991b1b" };
  if (vl.includes("xlbm") || vl.includes("đánh bóng"))
    return { bg: "#fef9c3", color: "#854d0e" };
  return { bg: "#f3f4f6", color: "#4b5563" };
}

/* ── Màu bàn ── */
const BAN_THEMES = {
  ban1: { gradient: "linear-gradient(135deg, #ef4444, #dc2626)", light: "#fef2f2", border: "#ef4444", text: "#991b1b", icon: "🔴" },
  ban2: { gradient: "linear-gradient(135deg, #f59e0b, #d97706)", light: "#fffbeb", border: "#f59e0b", text: "#92400e", icon: "🟡" },
  ban3: { gradient: "linear-gradient(135deg, #3b82f6, #1d4ed8)", light: "#eff6ff", border: "#3b82f6", text: "#1e40af", icon: "🔵" },
  ban4: { gradient: "linear-gradient(135deg, #10b981, #059669)", light: "#ecfdf5", border: "#10b981", text: "#065f46", icon: "🟢" },
};

/* ══════════════════════════════════════════ */
export default function TheoDoiQLCL({ nhanVien = [], keHoachPktDt = [], keHoachPkt = [], isLoading }) {
  const { message } = AntApp.useApp();

  /* ── State: phân công bàn ── */
  const [banData, setBanData] = useState({ ban1: [], ban2: [], ban3: [], ban4: [] });
  const [loadingBan, setLoadingBan] = useState(true);
  const [savingBan, setSavingBan] = useState(null);
  const [collapsedBans, setCollapsedBans] = useState(new Set());

  /* ── Modal thêm nhân viên ── */
  const [addModal, setAddModal] = useState({ open: false, ban: null });
  const [selectedCodes, setSelectedCodes] = useState([]);

  /* ── Bộ lọc ngày làm (ngay_tao) ── */
  const [filterDate, setFilterDate] = useState(dayjs());

  const toggleBanCollapse = useCallback((banKey) => {
    setCollapsedBans(prev => {
      const next = new Set(prev);
      if (next.has(banKey)) next.delete(banKey);
      else next.add(banKey);
      return next;
    });
  }, []);

  /* ── Fetch ban assignment from MongoDB ── */
  const fetchBanData = useCallback(async () => {
    try {
      const res = await fetch("/api/qlcl-ban");
      const json = await res.json();
      if (json.ok) setBanData(json.data);
    } catch { /* ignore */ }
    finally { setLoadingBan(false); }
  }, []);

  useEffect(() => { fetchBanData(); }, [fetchBanData]);

  /* ── NV lookup: code → info ── */
  const nvMap = useMemo(() => {
    const m = new Map();
    for (const nv of nhanVien) {
      m.set(nv.code, nv);
    }
    return m;
  }, [nhanVien]);

  /* ── order_kd → so_file lookup (từ ke_hoach_pkt) ── */
  const soFileMap = useMemo(() => {
    const m = new Map();
    for (const kh of keHoachPkt) {
      if (kh.order_kd && kh.so_file) {
        m.set(kh.order_kd, kh.so_file);
      }
    }
    return m;
  }, [keHoachPkt]);

  /* ── Phân tích ngay_tao "MM/DD/YYYY" → "YYYY-MM-DD" có thể sắp xếp ── */
  const toSortDate = (d) => {
    if (!d) return "0000-00-00";
    const p = d.split("/");
    if (p.length === 3) return `${p[2]}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}`;
    return d;
  };

  /* ── Lọc keHoachPktDt theo ngày được chọn ── */
  const filteredPktDt = useMemo(() => {
    if (!filterDate) return keHoachPktDt;
    const target = filterDate.format("MM/DD/YYYY");
    return keHoachPktDt.filter(kh => kh.ngay_tao === target);
  }, [keHoachPktDt, filterDate]);

  /* ── Đơn hàng đang làm theo mã NV (Code là EnumList: "0466 , 0576") ── */
  /* Chỉ giữ dòng mới nhất (ngay_tao) cho mỗi order_kd + ten_chi_tiet */
  const ordersByCode = useMemo(() => {
    // Bước 1: nhóm đơn hàng đang hoạt động theo mã nhân viên
    const raw = new Map(); // code → Map<orderKey, khRow>
    for (const kh of filteredPktDt) {
      const codeField = kh.Code; // Chữ C viết hoa trong ke_hoach_pkt_dt
      if (!codeField || !isActive(kh.ghi_trang_thai, kh.thoi_gian_hoan_thanh)) continue;
      const codes = [...new Set(codeField.split(",").map(s => s.trim()).filter(Boolean))];
      const sortDate = toSortDate(kh.ngay_tao);
      const rowNum = parseInt(kh._RowNumber) || 0;
      for (const code of codes) {
        if (!raw.has(code)) raw.set(code, new Map());
        const orderKey = `${kh.order_kd}|||${kh.ten_chi_tiet}`;
        const existing = raw.get(code).get(orderKey);
        if (!existing) {
          raw.get(code).set(orderKey, kh);
        } else {
          // Giữ mới nhất: ngay_tao trước, _RowNumber làm tiêu chí phụ
          const existDate = toSortDate(existing.ngay_tao);
          if (sortDate > existDate || (sortDate === existDate && rowNum > (parseInt(existing._RowNumber) || 0))) {
            raw.get(code).set(orderKey, kh);
          }
        }
      }
    }
    // Bước 2: chuyển sang code → mảng (sắp xếp theo ngay_tao giảm dần, _RowNumber giảm dần)
    const m = new Map();
    for (const [code, orderMap] of raw) {
      const orders = [...orderMap.values()].sort((a, b) => {
        const da = toSortDate(a.ngay_tao), db = toSortDate(b.ngay_tao);
        if (da !== db) return db.localeCompare(da);
        return (parseInt(b._RowNumber) || 0) - (parseInt(a._RowNumber) || 0);
      });
      m.set(code, orders);
    }
    return m;
  }, [filteredPktDt]);

  /* ── Bảng màu cho các đơn trùng nhau ── */
  const DUP_COLORS = [
    { bg: "#fef3c7", border: "#f59e0b", glow: "rgba(245,158,11,0.2)", text: "#92400e" },   // vàng
    { bg: "#dbeafe", border: "#3b82f6", glow: "rgba(59,130,246,0.2)", text: "#1e40af" },    // xanh dương
    { bg: "#fce7f3", border: "#ec4899", glow: "rgba(236,72,153,0.2)", text: "#9d174d" },    // hồng
    { bg: "#d1fae5", border: "#10b981", glow: "rgba(16,185,129,0.2)", text: "#065f46" },    // xanh lá
    { bg: "#ede9fe", border: "#8b5cf6", glow: "rgba(139,92,246,0.2)", text: "#5b21b6" },    // tím
    { bg: "#fee2e2", border: "#ef4444", glow: "rgba(239,68,68,0.2)", text: "#991b1b" },     // đỏ
    { bg: "#ffedd5", border: "#f97316", glow: "rgba(249,115,22,0.2)", text: "#9a3412" },    // cam
    { bg: "#e0f2fe", border: "#0ea5e9", glow: "rgba(14,165,233,0.2)", text: "#0c4a6e" },    // xanh nhạt
  ];

  /* ── Phát hiện NV cùng làm 1 đơn hàng + gán màu riêng ── */
  const { duplicateOrderColors, duplicatedCodes } = useMemo(() => {
    // Thu thập đơn hàng mới nhất của mỗi nhân viên được phân công
    const orderToCodesMap = new Map(); // orderKey → Set<code>
    const allAssigned = [];
    for (const codes of Object.values(banData)) {
      for (const c of codes) allAssigned.push(c);
    }
    for (const code of allAssigned) {
      const orders = ordersByCode.get(code) || [];
      if (orders.length === 0) continue;
      const latest = orders[0];
      const key = `${latest.order_kd}|||${latest.ten_chi_tiet}`;
      if (!orderToCodesMap.has(key)) orderToCodesMap.set(key, new Set());
      orderToCodesMap.get(key).add(code);
    }
    // Tìm đơn hàng được 2+ nhân viên cùng làm → gán chỉ số màu
    const dupColors = new Map(); // orderKey → color object
    const dupCodes = new Set();
    let colorIdx = 0;
    for (const [key, codesSet] of orderToCodesMap) {
      if (codesSet.size >= 2) {
        dupColors.set(key, DUP_COLORS[colorIdx % DUP_COLORS.length]);
        colorIdx++;
        for (const c of codesSet) dupCodes.add(c);
      }
    }
    return { duplicateOrderColors: dupColors, duplicatedCodes: dupCodes };
  }, [banData, ordersByCode]);

  /* ── Tất cả code đã phân công ── */
  const assignedCodes = useMemo(() => {
    const s = new Set();
    for (const codes of Object.values(banData)) {
      for (const c of codes) s.add(c);
    }
    return s;
  }, [banData]);

  /* ── NV chưa phân công (cho dropdown) ── */
  const availableNV = useMemo(() => {
    return nhanVien.filter(nv => !assignedCodes.has(nv.code));
  }, [nhanVien, assignedCodes]);

  /* ── Lưu phân công bàn vào MongoDB ── */
  const saveBan = useCallback(async (ban, codes) => {
    setSavingBan(ban);
    try {
      const res = await fetch("/api/qlcl-ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ban, codes }),
      });
      const json = await res.json();
      if (json.ok) {
        setBanData(json.data);
      }
    } catch (err) {
      message.error("Lỗi lưu phân công bàn");
    } finally {
      setSavingBan(null);
    }
  }, [message]);

  /* ── Thêm nhân viên vào bàn ── */
  const handleAddNV = useCallback(() => {
    if (!addModal.ban || selectedCodes.length === 0) return;
    const ban = addModal.ban;
    const newCodes = [...(banData[ban] || []), ...selectedCodes];
    saveBan(ban, newCodes);
    setAddModal({ open: false, ban: null });
    setSelectedCodes([]);
    message.success(`Đã thêm ${selectedCodes.length} nhân viên vào ${ban.replace("ban", "Bàn ")}`);
  }, [addModal.ban, selectedCodes, banData, saveBan, message]);

  /* ── Gỡ nhân viên khỏi bàn ── */
  const handleRemoveNV = useCallback((ban, code) => {
    const newCodes = (banData[ban] || []).filter(c => c !== code);
    saveBan(ban, newCodes);
  }, [banData, saveBan]);

  /* ── Loading ── */
  if (isLoading || loadingBan) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 400 }}>
        <Spin size="large" tip="Đang tải dữ liệu..." />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "#f0f2f5" }}>
      {/* ── Header ── */}
      <div className="qlcl-header" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", background: "#fff", borderBottom: "1px solid #e5e7eb",
        flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TeamOutlined style={{ fontSize: 18, color: "#2563eb" }} />
          <span className="qlcl-header-title" style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
            Theo dõi tiến độ QLCL — 4 Bàn kiểm tra
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <DatePicker
            value={filterDate}
            onChange={(date) => setFilterDate(date)}
            format="DD/MM/YYYY"
            allowClear={false}
            size="small"
            style={{ width: 130 }}
            placeholder="Ngày làm"
          />
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {filteredPktDt.filter(k => isActive(k.ghi_trang_thai, k.thoi_gian_hoan_thanh)).length} đơn đang làm
          </span>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchBanData}>Làm mới</Button>
        </div>
      </div>

      {/* ── 3 Bàn ── */}
      <div className="qlcl-grid" style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
        padding: 12, flex: 1, overflow: "auto", minHeight: 0,
        alignItems: "start",
      }}>
        {["ban1", "ban2", "ban3", "ban4"].map((banKey) => {
          const theme = BAN_THEMES[banKey];
          const codes = banData[banKey] || [];
          const banLabel = banKey.replace("ban", "Bàn ");

          return (
            <div key={banKey} className="qlcl-ban-container" style={{
              background: "#fff",
              borderRadius: 12,
              border: `1.5px solid ${theme.border}33`,
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}>
              {/* Tiêu đề bàn */}
              <div className="qlcl-ban-header" style={{
                background: theme.gradient,
                padding: "12px 16px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer",
              }} onClick={() => toggleBanCollapse(banKey)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{theme.icon}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{banLabel}</span>
                  <span style={{
                    background: "rgba(255,255,255,0.25)", borderRadius: 12,
                    padding: "2px 10px", fontSize: 12, fontWeight: 600, color: "#fff",
                  }}>
                    {codes.length} người
                  </span>
                  {collapsedBans.has(banKey)
                    ? <DownOutlined style={{ color: "#fff", fontSize: 12 }} />
                    : <UpOutlined style={{ color: "#fff", fontSize: 12 }} />
                  }
                </div>
                <Button
                  type="primary"
                  ghost
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={(e) => { e.stopPropagation(); setAddModal({ open: true, ban: banKey }); setSelectedCodes([]); }}
                  style={{
                    borderColor: "rgba(255,255,255,0.6)", color: "#fff",
                    fontWeight: 600, borderRadius: 8,
                  }}
                >
                  Thêm NV
                </Button>
              </div>

              {/* Thẻ NV — có thể thu gọn */}
              {!collapsedBans.has(banKey) && (
              <div className="qlcl-nv-list" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {codes.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<span style={{ fontSize: 12, color: "#9ca3af" }}>Chưa có nhân viên</span>}
                    style={{ margin: "24px 0" }}
                  />
                ) : (
                  codes.map(code => {
                    const nv = nvMap.get(code);
                    const allOrders = ordersByCode.get(code) || [];
                    const orders = allOrders.length > 0 ? [allOrders[0]] : [];
                    const name = nv?.ho_va_ten || `NV ${code}`;
                    const nhom = nv?.nhom || "";
                    const to = nv?.to || "";

                    const isDup = duplicatedCodes.has(code);
                    // Lấy màu từ đơn hàng trùng lặp mà nhân viên đang làm
                    const nvDupColor = isDup && orders.length > 0
                      ? duplicateOrderColors.get(`${orders[0].order_kd}|||${orders[0].ten_chi_tiet}`)
                      : null;

                    return (
                      <div key={code} className="qlcl-nv-card" style={{
                        border: nvDupColor ? `2px solid ${nvDupColor.border}` : "1px solid #e5e7eb",
                        borderRadius: 10,
                        background: nvDupColor ? nvDupColor.bg : "#fafbfc",
                        overflow: "hidden",
                        transition: "box-shadow 0.2s",
                        boxShadow: nvDupColor ? `0 0 0 3px ${nvDupColor.glow}` : "none",
                      }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = nvDupColor ? `0 0 0 3px ${nvDupColor.glow}, 0 2px 8px rgba(0,0,0,0.08)` : "0 2px 8px rgba(0,0,0,0.08)"}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = nvDupColor ? `0 0 0 3px ${nvDupColor.glow}` : "none"}
                      >
                        {/* Tiêu đề NV */}
                        <div className="qlcl-nv-header" style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px",
                          background: nvDupColor ? nvDupColor.bg : theme.light,
                          borderBottom: nvDupColor ? `1px solid ${nvDupColor.border}` : "1px solid #e5e7eb",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                            <div className="qlcl-nv-avatar" style={{
                              width: 32, height: 32, borderRadius: "50%",
                              background: theme.gradient,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0,
                            }}>
                              {name.charAt(name.lastIndexOf(" ") + 1) || "?"}
                            </div>
                            <div className="qlcl-nv-info" style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                              <div style={{ fontSize: 11, color: "#6b7280" }}>
                                Mã: {code}
                                {nhom && <> · {nhom}</>}
                                {to && to !== "0" && <> · Tổ {to}</>}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Tag color={orders.length > 0 ? "blue" : "default"} style={{ margin: 0, fontSize: 11 }}>
                              {orders.length} đơn
                            </Tag>
                            <Tooltip title="Gỡ khỏi bàn">
                              <Button
                                type="text" size="small" danger
                                icon={<CloseOutlined style={{ fontSize: 12 }} />}
                                onClick={() => handleRemoveNV(banKey, code)}
                                style={{ width: 24, height: 24, padding: 0, borderRadius: "50%" }}
                              />
                            </Tooltip>
                          </div>
                        </div>

                        {/* Đơn hàng */}
                        <div style={{ padding: "6px 10px" }}>
                          {orders.length === 0 ? (
                            <div style={{ padding: "6px 0", fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
                              Không có đơn hàng đang làm
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {orders.map((kh, i) => {
                                const ttStyle = getTrangThaiStyle(kh.ghi_trang_thai);
                                const orderKey = `${kh.order_kd}|||${kh.ten_chi_tiet}`;
                                const dupColor = duplicateOrderColors.get(orderKey);
                                const isOrderDup = !!dupColor;
                                return (
                                  <div key={`${kh.order_kd}_${kh.ten_chi_tiet}_${i}`} className="qlcl-order-row" style={{
                                    display: "flex", alignItems: "center", gap: 6,
                                    padding: "4px 8px", borderRadius: 6,
                                    background: isOrderDup ? dupColor.bg : "#fff",
                                    border: isOrderDup ? `1.5px solid ${dupColor.border}` : "1px solid #f0f0f0",
                                    fontSize: 11, flexWrap: "wrap",
                                  }}>
                                    <div className="qlcl-order-info" style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                                      {isOrderDup && <span style={{ fontSize: 12, flexShrink: 0 }}>⚠️</span>}
                                      <ShoppingOutlined style={{ color: isOrderDup ? dupColor.text : "#9ca3af", fontSize: 11, flexShrink: 0 }} />
                                      <span style={{ fontWeight: 600, color: "#374151" }}>
                                        {kh.order_kd}
                                      </span>
                                      <span style={{
                                        color: "#1e40af", fontWeight: 500,
                                        overflow: "hidden", textOverflow: "ellipsis",
                                        flex: 1, minWidth: 0,
                                      }} title={`${kh.ten_chi_tiet}${soFileMap.get(kh.order_kd) ? ` (${soFileMap.get(kh.order_kd)})` : ""}`}>
                                        {kh.ten_chi_tiet}
                                        {soFileMap.get(kh.order_kd) && <span style={{ color: "#6b7280", fontWeight: 400 }}> {soFileMap.get(kh.order_kd)}</span>}
                                      </span>
                                    </div>
                                    <div className="qlcl-order-meta" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                      <span style={{ color: "#6b7280" }}>
                                        SL: {kh.sll || "—"}
                                      </span>
                                      <span style={{
                                        padding: "1px 6px", borderRadius: 4,
                                        fontSize: 10, fontWeight: 600,
                                        background: ttStyle.bg, color: ttStyle.color,
                                        whiteSpace: "nowrap",
                                      }}>
                                        {kh.ghi_trang_thai}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modal thêm nhân viên ── */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserOutlined style={{ color: "#2563eb" }} />
            <span>Thêm nhân viên vào {addModal.ban?.replace("ban", "Bàn ") || ""}</span>
          </div>
        }
        open={addModal.open}
        onCancel={() => { setAddModal({ open: false, ban: null }); setSelectedCodes([]); }}
        onOk={handleAddNV}
        okText="Thêm"
        cancelText="Hủy"
        centered
        width={480}
        okButtonProps={{ disabled: selectedCodes.length === 0 }}
      >
        <div style={{ padding: "12px 0" }}>
          <p style={{ fontSize: 13, color: "#4b5563", marginBottom: 12 }}>
            Chọn nhân viên chưa được phân công:
          </p>
          <Select
            mode="multiple"
            placeholder="Tìm theo tên hoặc mã nhân viên..."
            value={selectedCodes}
            onChange={setSelectedCodes}
            style={{ width: "100%" }}
            showSearch
            optionFilterProp="label"
            maxTagCount={5}
            options={availableNV.map(nv => ({
              label: `${nv.code} — ${nv.ho_va_ten}${nv.nhom ? ` (${nv.nhom})` : ""}`,
              value: nv.code,
            }))}
            notFoundContent={
              <span style={{ color: "#9ca3af", fontSize: 12 }}>Tất cả nhân viên đã được phân công</span>
            }
          />
          {selectedCodes.length > 0 && (
            <p style={{ fontSize: 12, color: "#2563eb", marginTop: 8 }}>
              Đã chọn {selectedCodes.length} nhân viên
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
