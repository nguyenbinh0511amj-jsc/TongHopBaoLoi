"use client";
import { useState, useMemo, useCallback } from "react";
import { Input, Button, Spin, InputNumber } from "antd";
import { SearchOutlined, DownloadOutlined, ClearOutlined } from "@ant-design/icons";

/* ── Helpers ── */
function toVNDate(val) {
  if (!val) return "";
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return val;
  const [, a, b, y] = m;
  if (Number(a) > 12) return val;
  return `${b.padStart(2, "0")}/${a.padStart(2, "0")}/${y}`;
}

/**
 * Build merged data:
 * 1. Group phieu_bao_loi by (order_pbl, ten_chi_tiet_pbl) → list of phiếu
 * 2. Group tong_hop_loi by phieu_bao_loi_id → list of nội dung lỗi
 * 3. For each xac_nhan_ke_hoach row, lookup matching phiếu → chi tiết lỗi
 * 4. Only keep rows that have at least 1 phiếu
 */
function buildData(xacNhanKeHoach, phieuBaoLoi, tongHopLoi) {
  // 1. Index tong_hop_loi by phieu_bao_loi_id
  const thlByPbl = new Map();
  for (const row of tongHopLoi) {
    const pid = row.phieu_bao_loi_id;
    if (!pid) continue;
    if (!thlByPbl.has(pid)) thlByPbl.set(pid, []);
    thlByPbl.get(pid).push(row);
  }

  // 2. Group phieu_bao_loi by (order_pbl, ten_chi_tiet_pbl) and attach nội dung
  const pblByOrder = new Map(); // key: "order|ten_chi_tiet" → [{ phieu, noiDungs }]
  for (const pbl of phieuBaoLoi) {
    const order = (pbl.order_pbl || "").trim();
    const tenCT = (pbl.ten_chi_tiet_pbl || "").trim();
    if (!order || !tenCT) continue;
    const key = `${order}|||${tenCT}`;
    if (!pblByOrder.has(key)) pblByOrder.set(key, []);

    // Get nội dung lỗi for this phiếu
    const noiDungs = thlByPbl.get(pbl.ID_pbl) || [];

    pblByOrder.get(key).push({
      ID_pbl: pbl.ID_pbl,
      ngay_bao_loi: pbl.ngay_bao_loi_pbl || "",
      trang_thai: pbl.trang_thai_pbl || "",
      tong_sl_bao_loi: Number(pbl.tong_sl_bao_loi_pbl) || 0,
      noiDungs: noiDungs.map(nd => ({
        noi_dung_loi: nd.noi_dung_loi || "",
        sl_loi: Number(nd.sl_loi) || 0,
        ma_loi: nd.ma_loi || "",
        noi_phat_sinh: nd.noi_phat_sinh_loi || "",
      })),
    });
  }

  // 3. Merge with xac_nhan_ke_hoach
  const result = [];
  let maxPhieu = 0;
  for (const kh of xacNhanKeHoach) {
    const order = (kh.order_kd || "").trim();
    const tenCT = (kh.ten_chi_tiet || "").trim();
    if (!order || !tenCT) continue;

    const key = `${order}|||${tenCT}`;
    const phieus = pblByOrder.get(key);
    if (!phieus || phieus.length === 0) continue;

    // Collect all noi_dung_loi across all phieus for summary
    const allNoiDungs = [];
    for (const p of phieus) {
      for (const nd of p.noiDungs) {
        allNoiDungs.push(nd);
      }
    }

    const soLanLoi = phieus.length;
    if (soLanLoi > maxPhieu) maxPhieu = soLanLoi;

    // Summary text: concat all noi_dung_loi
    const summaryParts = allNoiDungs
      .filter(nd => nd.noi_dung_loi)
      .map(nd => nd.noi_dung_loi);
    const summaryText = summaryParts.join("\n");

    // Total sl_bao_loi
    const tongSlBaoLoi = allNoiDungs.reduce((s, nd) => s + nd.sl_loi, 0);

    result.push({
      stt: kh.stt || "",
      order_kd: order,
      ten_chi_tiet: tenCT,
      file_gc: kh.file_gc || "",
      sll: Number(kh.sll) || 0,
      tt: kh.tt || "",
      xac_nhan_cu: kh.xac_nhan_cu || "",
      xac_nhan_moi: kh.xac_nhan_moi || "",
      trang_thai: kh.trang_thai || "",
      summaryText,
      tongSlBaoLoi,
      soLanLoi,
      phieus,
      _searchText: `${order} ${tenCT} ${kh.file_gc || ""}`.toLowerCase(),
    });
  }

  // Sort by stt
  result.sort((a, b) => {
    const na = Number(a.stt) || 999;
    const nb = Number(b.stt) || 999;
    return na - nb;
  });

  return { rows: result, maxPhieu };
}

/* ════════════════════════════════════════ */
export default function DonHangLoiKHHT({ xacNhanKeHoach, phieuBaoLoi, tongHopLoi, isLoading }) {
  const [search, setSearch] = useState("");
  const [minLoi, setMinLoi] = useState(1);

  const { rows: allRows, maxPhieu } = useMemo(
    () => buildData(xacNhanKeHoach || [], phieuBaoLoi || [], tongHopLoi || []),
    [xacNhanKeHoach, phieuBaoLoi, tongHopLoi]
  );

  const filteredRows = useMemo(() => {
    let data = allRows;
    if (minLoi > 1) data = data.filter(r => r.soLanLoi >= minLoi);
    if (search.trim()) {
      const s = search.toLowerCase();
      data = data.filter(r => r._searchText.includes(s));
    }
    return data;
  }, [allRows, search, minLoi]);

  // Recalc maxPhieu for filtered rows
  const displayMaxPhieu = useMemo(() => {
    let m = 0;
    for (const r of filteredRows) {
      if (r.phieus.length > m) m = r.phieus.length;
    }
    return m;
  }, [filteredRows]);

  /* ── Export Excel ── */
  const exportExcel = useCallback(async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Đơn hàng lỗi KHHT");
    const FIXED_COUNT = 8;

    // ── Header row 1: fixed + merged "Phiếu N" ──
    const h1 = ["STT", "Order KD", "Tên chi tiết", "File GC", "Số lượng", "TT ưu tiên", "Xác nhận cũ", "Xác nhận mới"];
    for (let i = 0; i < displayMaxPhieu; i++) h1.push(`Phiếu ${i + 1}`, "", "");
    ws.addRow(h1);

    // ── Header row 2: sub-headers ──
    const h2 = ["", "", "", "", "", "", "", ""];
    for (let i = 0; i < displayMaxPhieu; i++) h2.push("Nội dung lỗi", "SL", "Nơi phát sinh");
    ws.addRow(h2);

    // Merge fixed headers vertically (rows 1-2)
    for (let c = 1; c <= FIXED_COUNT; c++) {
      ws.mergeCells(1, c, 2, c);
    }
    // Merge "Phiếu N" horizontally (3 cols each)
    for (let i = 0; i < displayMaxPhieu; i++) {
      const startCol = FIXED_COUNT + 1 + i * 3;
      ws.mergeCells(1, startCol, 1, startCol + 2);
    }

    // Style headers
    const headerStyle = {
      font: { bold: true, size: 11 },
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } },
      border: {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      },
    };
    [1, 2].forEach(rowNum => {
      const row = ws.getRow(rowNum);
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = headerStyle.font;
        cell.alignment = headerStyle.alignment;
        cell.fill = headerStyle.fill;
        cell.border = headerStyle.border;
      });
      row.height = 22;
    });

    // Phiếu header background (alternating colors)
    for (let i = 0; i < displayMaxPhieu; i++) {
      const startCol = FIXED_COUNT + 1 + i * 3;
      const color = i % 2 === 0 ? "FFDBEAFE" : "FFFCE7F3";
      for (let c = startCol; c <= startCol + 2; c++) {
        ws.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
        ws.getCell(2, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      }
    }

    // ── Data rows ──
    const thinBorder = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
    // Alignment per fixed column: [STT, Order, Tên CT, File GC, SLL, TT, XN cũ, XN mới]
    const fixedAlign = [
      { horizontal: "center", vertical: "middle", wrapText: true },  // STT
      { horizontal: "left", vertical: "top", wrapText: true },      // Order KD
      { horizontal: "left", vertical: "top", wrapText: true },      // Tên chi tiết
      { horizontal: "center", vertical: "top", wrapText: true },    // File GC
      { horizontal: "center", vertical: "middle", wrapText: true }, // Số lượng
      { horizontal: "center", vertical: "middle", wrapText: true }, // TT ưu tiên
      { horizontal: "left", vertical: "top", wrapText: true },      // Xác nhận cũ
      { horizontal: "left", vertical: "top", wrapText: true },      // Xác nhận mới
    ];
    // Alignment per phiếu sub-column: [Nội dung lỗi, SL, Nơi phát sinh]
    const phieuAlign = [
      { horizontal: "left", vertical: "top", wrapText: true },      // Nội dung lỗi
      { horizontal: "center", vertical: "top", wrapText: true },    // SL
      { horizontal: "center", vertical: "top", wrapText: true },    // Nơi phát sinh
    ];

    filteredRows.forEach((r, idx) => {
      const rowData = [
        idx + 1,
        r.order_kd,
        r.ten_chi_tiet,
        r.file_gc,
        r.sll,
        r.tt,
        r.xac_nhan_cu,
        r.xac_nhan_moi,
      ];

      let maxLines = 1;
      for (let i = 0; i < displayMaxPhieu; i++) {
        const p = r.phieus[i];
        if (p) {
          const nds = p.noiDungs.filter(nd => nd.noi_dung_loi);
          const ndText = nds.map(nd => nd.noi_dung_loi).join("\n");
          const slText = nds.map(nd => String(nd.sl_loi)).join("\n");
          const npsText = nds.map(nd => nd.noi_phat_sinh).join("\n");

          rowData.push(ndText, slText, npsText);
          if (nds.length > maxLines) maxLines = nds.length;
        } else {
          rowData.push("", "", "");
        }
      }

      const excelRow = ws.addRow(rowData);
      excelRow.height = Math.max(16, maxLines * 15);

      // Apply alignment, border, font per column
      excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = thinBorder;
        cell.font = { size: 11 };
        if (colNumber <= FIXED_COUNT) {
          cell.alignment = fixedAlign[colNumber - 1] || fixedAlign[0];
        } else {
          // Phiếu sub-column index: 0=Nội dung, 1=SL, 2=NPS
          const subIdx = (colNumber - FIXED_COUNT - 1) % 3;
          cell.alignment = phieuAlign[subIdx];
        }
      });

      // Yellow background for phiếu columns with content
      for (let i = 0; i < displayMaxPhieu; i++) {
        const p = r.phieus[i];
        if (p && p.noiDungs.length > 0) {
          const startCol = FIXED_COUNT + 1 + i * 3;
          const color = "FFFFFDE7";
          for (let c = startCol; c <= startCol + 2; c++) {
            excelRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
          }
        }
      }
    });

    // ── Column widths ──
    const colWidths = [4, 12, 15, 8, 8, 9, 14, 16];
    for (let i = 0; i < displayMaxPhieu; i++) {
      colWidths.push(18, 4, 9); // Nội dung lỗi, SL, Nơi phát sinh
    }
    colWidths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    // ── Download ──
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Don_hang_loi_KHHT_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRows, displayMaxPhieu]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setMinLoi(1);
  }, []);

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
        <Spin size="large" tip="Đang tải dữ liệu..." />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "#f8fafc" }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "8px 16px", background: "#fff", borderBottom: "1px solid #e2e8f0",
      }}>
        <Input
          placeholder="Tìm order, tên chi tiết, file..."
          size="small" allowClear value={search}
          prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 260, borderRadius: 6 }}
        />
        <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>≥ lần lỗi:</span>
          <InputNumber size="small" min={1} max={99} value={minLoi}
            onChange={v => setMinLoi(v || 1)} style={{ width: 55 }} />
        </div>
        {(search || minLoi > 1) && (
          <Button type="link" danger size="small" icon={<ClearOutlined />}
            onClick={clearFilters} style={{ padding: "0 6px", fontSize: 12 }}>Xóa lọc</Button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          <b style={{ color: "#111827" }}>{filteredRows.length}</b> / {allRows.length} đơn hàng có lỗi
        </span>
        <div style={{ width: 1, height: 16, background: "#e2e8f0" }} />
        <Button size="small" icon={<DownloadOutlined />} onClick={exportExcel}>Xuất Excel</Button>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
          fontFamily: "var(--font-inter), Inter, sans-serif",
        }}>
          <thead>
            <tr>
              {/* Fixed headers */}
              <Th style={{ minWidth: 40, textAlign: "center" }}>STT</Th>
              <Th style={{ minWidth: 110 }}>Order KD</Th>
              <Th style={{ minWidth: 140 }}>Tên chi tiết</Th>
              <Th style={{ minWidth: 80, textAlign: "center" }}>File GC</Th>
              <Th style={{ minWidth: 70, textAlign: "center" }}>Số lượng</Th>
              <Th style={{ minWidth: 60, textAlign: "center" }}>TT ưu tiên</Th>
              <Th style={{ minWidth: 120 }}>Xác nhận cũ</Th>
              <Th style={{ minWidth: 120 }}>Xác nhận mới</Th>
              {/* Yellow summary */}
              <Th style={{ minWidth: 200, background: "#fef9c3", color: "#854d0e" }}>Tóm tắt nội dung lỗi</Th>
              <Th style={{ minWidth: 60, textAlign: "center", background: "#fef9c3", color: "#854d0e" }}>SL lỗi</Th>
              {/* Dynamic phieu columns */}
              {Array.from({ length: displayMaxPhieu }, (_, i) => (
                <Th key={`ndl_${i}`} style={{ minWidth: 180, background: i % 2 === 0 ? "#f0f9ff" : "#fdf2f8" }}>
                  Nội dung lỗi {i + 1}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => (
              <tr
                key={`${row.order_kd}_${row.ten_chi_tiet}_${idx}`}
                style={{
                  borderBottom: "1px solid #f0f0f0",
                  background: idx % 2 === 0 ? "#fff" : "#fafbfd",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#f0f7ff"}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#fafbfd"}
              >
                <Td style={{ textAlign: "center", color: "#6b7280", fontWeight: 600 }}>{idx + 1}</Td>
                <Td style={{ fontWeight: 600, color: "#1e293b" }}>{row.order_kd}</Td>
                <Td style={{ fontWeight: 600, color: "#1e40af" }}>{row.ten_chi_tiet}</Td>
                <Td style={{ textAlign: "center" }}>
                  <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: "#e0f2fe", color: "#0369a1" }}>{row.file_gc}</span>
                </Td>
                <Td style={{ textAlign: "center", fontWeight: 600 }}>{row.sll}</Td>
                <Td style={{ textAlign: "center" }}>{row.tt}</Td>
                <Td style={{ fontSize: 11, color: "#4b5563" }}>{row.xac_nhan_cu}</Td>
                <Td style={{ fontSize: 11, color: "#4b5563" }}>{row.xac_nhan_moi}</Td>
                {/* Yellow summary */}
                <Td style={{ background: "#fffde7", maxWidth: 300 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {row.phieus.map((p, pi) => (
                      p.noiDungs.map((nd, ni) => (
                        <span key={`${pi}_${ni}`} style={{
                          fontSize: 11, color: "#92400e", whiteSpace: "nowrap",
                        }}>
                          {nd.noi_dung_loi || "—"}
                        </span>
                      ))
                    ))}
                  </div>
                </Td>
                <Td style={{ textAlign: "center", background: "#fffde7", fontWeight: 700, color: "#dc2626" }}>
                  {row.tongSlBaoLoi || "—"}
                </Td>
                {/* Dynamic phieu columns */}
                {Array.from({ length: displayMaxPhieu }, (_, i) => {
                  const p = row.phieus[i];
                  if (!p) return <Td key={`p_${i}`} style={{ background: i % 2 === 0 ? "#f8fcff" : "#fef7fa" }} />;
                  return (
                    <Td key={`p_${i}`} style={{ background: i % 2 === 0 ? "#f8fcff" : "#fef7fa", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {p.noiDungs.map((nd, ni) => (
                          <div key={ni} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 11, color: "#374151", flex: 1 }}>{nd.noi_dung_loi || "—"}</span>
                            <span style={{
                              padding: "0 5px", borderRadius: 8, fontSize: 10, fontWeight: 700,
                              background: "#fee2e2", color: "#991b1b", whiteSpace: "nowrap",
                              minWidth: 18, textAlign: "center",
                            }}>{nd.sl_loi}</span>
                            {nd.noi_phat_sinh && (
                              <span style={{
                                padding: "0 5px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                                background: "#e0e7ff", color: "#3730a3", whiteSpace: "nowrap",
                              }}>{nd.noi_phat_sinh}</span>
                            )}
                          </div>
                        ))}
                        {p.noiDungs.length === 0 && <span style={{ color: "#d1d5db" }}>—</span>}
                      </div>
                    </Td>
                  );
                })}
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={10 + displayMaxPhieu} style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                  {allRows.length === 0 ? "Không có đơn hàng nào phát sinh lỗi trên KHHT" : "Không tìm thấy kết quả phù hợp"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Table cell components ── */
function Th({ children, style = {} }) {
  return (
    <th style={{
      padding: "8px 10px",
      background: "#f1f5f9",
      borderBottom: "2px solid #e2e8f0",
      borderRight: "1px solid #e2e8f0",
      fontSize: 12,
      fontWeight: 600,
      color: "#334155",
      textAlign: "left",
      whiteSpace: "nowrap",
      position: "sticky",
      top: 0,
      zIndex: 1,
      ...style,
    }}>
      {children}
    </th>
  );
}

function Td({ children, style = {} }) {
  return (
    <td style={{
      padding: "6px 10px",
      borderRight: "1px solid #f0f0f0",
      fontSize: 12,
      color: "#1e293b",
      ...style,
    }}>
      {children}
    </td>
  );
}
