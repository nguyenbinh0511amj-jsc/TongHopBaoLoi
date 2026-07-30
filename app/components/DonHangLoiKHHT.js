"use client";
import { useState, useMemo, useCallback } from "react";
import { Input, Button, Spin, InputNumber } from "antd";
import { SearchOutlined, DownloadOutlined, ClearOutlined } from "@ant-design/icons";

/* ── Hàm hỗ trợ ── */
function toVNDate(val) {
  if (!val) return "";
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return val;
  const [, a, b, y] = m;
  if (Number(a) > 12) return val;
  return `${b.padStart(2, "0")}/${a.padStart(2, "0")}/${y}`;
}

/** Chuẩn hóa nội dung lỗi để so sánh: bỏ khoảng trắng thừa quanh dấu : và trim */
function normalizeND(s) {
  return (s || "").trim().replace(/\s*:\s*/g, ": ").replace(/\s+/g, " ");
}

/**
 * Xây dựng dữ liệu gộp:
 * 1. Nhóm phieu_bao_loi theo (order_pbl, ten_chi_tiet_pbl) → danh sách phiếu
 * 2. Nhóm tong_hop_loi theo phieu_bao_loi_id → danh sách nội dung lỗi
 * 3. Với mỗi dòng xac_nhan_ke_hoach, tra cứu phiếu tương ứng → chi tiết lỗi
 * 4. Chỉ giữ lại các dòng có ít nhất 1 phiếu
 */
function buildData(xacNhanKeHoach, tongHopLoi, giaoHangPSX) {
  // 0. Tạo bảng tra cứu: order_kd → { ngay_giao, sl_da_xac_nhan, noi_dung_da_xac_nhan } từ Giao_Hang_PSX
  const ghpsxLookup = new Map();
  for (const r of giaoHangPSX) {
    if (r.order_kd) {
      ghpsxLookup.set(r.order_kd, {
        ngay_giao: r.ngay_giao || "",
        sl_da_xac_nhan: r.sl_da_xac_nhan_khi_giao_hang || "",
        noi_dung_da_xac_nhan: r.noi_dung_da_xac_nhan_khi_giao_hang || "",
      });
    }
  }

  // Đếm số lần lỗi cho mỗi nội dung lỗi theo tên chi tiết
  const noiDungCountMap = new Map();
  for (const r of tongHopLoi) {
    const tc = (r.ten_chi_tiet || "").trim();
    const nd = normalizeND(r.noi_dung_loi);
    if (!tc || !nd) continue;
    const ck = `${tc}|||${nd}`;
    noiDungCountMap.set(ck, (noiDungCountMap.get(ck) || 0) + 1);
  }

  // 1. Nhóm tong_hop_loi theo phieu_bao_loi_id để tạo các phiếu ảo
  const pblMap = new Map(); // phieu_bao_loi_id -> { rows: [], order_kd, ten_chi_tiet, ngay_bao_loi, trang_thai }
  let virtualIdCounter = 1;

  for (const row of tongHopLoi) {
    let pid = row.phieu_bao_loi_id;
    if (!pid) {
      pid = `VIRTUAL_PBL_${virtualIdCounter++}`;
    }
    if (!pblMap.has(pid)) {
      pblMap.set(pid, {
        rows: [],
        order_kd: (row.order_kd || "").trim(),
        ten_chi_tiet: (row.ten_chi_tiet || "").trim(),
        ngay_bao_loi: row.ngay_bao_loi || "",
        trang_thai: row.trang_thai || "",
      });
    }
    pblMap.get(pid).rows.push(row);
  }

  // 2. Nhóm phiếu theo (order, ten_chi_tiet)
  const pblByOrder = new Map(); // khóa: "order|ten_chi_tiet" → [{ phieu, noiDungs }]
  for (const [pid, pInfo] of pblMap.entries()) {
    const order = pInfo.order_kd;
    const tenCT = pInfo.ten_chi_tiet;
    if (!order || !tenCT) continue;
    const key = `${order}|||${tenCT}`;
    if (!pblByOrder.has(key)) pblByOrder.set(key, []);

    const tong_sl_bao_loi = pInfo.rows.reduce((s, r) => s + (Number(r.sl_loi) || 0), 0);

    pblByOrder.get(key).push({
      ID_pbl: pid,
      ngay_bao_loi: pInfo.ngay_bao_loi || "",
      trang_thai: pInfo.trang_thai || "",
      tong_sl_bao_loi,
      noiDungs: pInfo.rows.map(nd => {
        const ndNorm = normalizeND(nd.noi_dung_loi);
        const ck = `${tenCT}|||${ndNorm}`;
        return {
          noi_dung_loi: nd.noi_dung_loi || "",
          sl_loi: Number(nd.sl_loi) || 0,
          ma_loi: nd.ma_loi || "",
          noi_phat_sinh: nd.noi_phat_sinh_loi || "",
          noi_xu_ly_loi: nd.noi_xu_ly_loi || "",
          so_lan: noiDungCountMap.get(ck) || 0,
        };
      }),
    });
  }

  // 3. Gộp với xac_nhan_ke_hoach
  const result = [];
  let maxPhieu = 0;
  for (const kh of xacNhanKeHoach) {
    const order = (kh.order_kd || "").trim();
    const tenCT = (kh.ten_chi_tiet || "").trim();
    if (!order || !tenCT) continue;

    const key = `${order}|||${tenCT}`;
    const phieus = pblByOrder.get(key);
    if (!phieus || phieus.length === 0) continue;

    // Thu thập tất cả noi_dung_loi từ các phiếu để tóm tắt
    const allNoiDungs = [];
    const noiXuLySet = new Set();
    for (const p of phieus) {
      for (const nd of p.noiDungs) {
        allNoiDungs.push(nd);
        if (nd.noi_xu_ly_loi) noiXuLySet.add(nd.noi_xu_ly_loi);
      }
    }

    const soLanLoi = phieus.length;
    if (soLanLoi > maxPhieu) maxPhieu = soLanLoi;

    // Văn bản tóm tắt: nối tất cả noi_dung_loi
    const summaryParts = allNoiDungs
      .filter(nd => nd.noi_dung_loi)
      .map(nd => nd.noi_dung_loi);
    const summaryText = summaryParts.join("\n");

    // Tổng sl_bao_loi
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
      ngay_giao_hang: (ghpsxLookup.get(order) || {}).ngay_giao || "",
      sl_da_xac_nhan_gh: (ghpsxLookup.get(order) || {}).sl_da_xac_nhan || "",
      noi_dung_da_xac_nhan_gh: (ghpsxLookup.get(order) || {}).noi_dung_da_xac_nhan || "",
      trang_thai: kh.trang_thai || "",
      summaryText,
      tongSlBaoLoi,
      soLanLoi,
      noiXuLys: [...noiXuLySet],
      phieus,

      _searchText: `${order} ${tenCT} ${kh.file_gc || ""}`.toLowerCase(),
    });
  }

  // Sắp xếp theo STT
  result.sort((a, b) => {
    const na = Number(a.stt) || 999;
    const nb = Number(b.stt) || 999;
    return na - nb;
  });

  return { rows: result, maxPhieu };
}

/* ════════════════════════════════════════ */
export default function DonHangLoiKHHT({ xacNhanKeHoach, tongHopLoi, giaoHangPSX, isLoading }) {
  const [search, setSearch] = useState("");
  const [minLoi, setMinLoi] = useState(1);

  const { rows: allRows, maxPhieu } = useMemo(
    () => buildData(xacNhanKeHoach || [], tongHopLoi || [], giaoHangPSX || []),
    [xacNhanKeHoach, tongHopLoi, giaoHangPSX]
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

  // Tính lại maxPhieu cho các dòng đã lọc
  const displayMaxPhieu = useMemo(() => {
    let m = 0;
    for (const r of filteredRows) {
      if (r.phieus.length > m) m = r.phieus.length;
    }
    return m;
  }, [filteredRows]);

  /* ── Xuất Excel ── */
  const exportExcel = useCallback(async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Đơn hàng lỗi KHHT");
    const FIXED_COUNT = 11;

    // ── Dòng 1: "List họp DD/MM/YYYY" ──
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const titleRow = ws.addRow([`List họp ${dd}/${mm}/${yyyy}`]);
    titleRow.getCell(1).font = { bold: true, size: 13 };
    titleRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    titleRow.height = 26;

    // ── Dòng tiêu đề 2: cố định + gộp "Phiếu N" ──
    const h1 = ["STT", "Order KD", "Tên chi tiết", "File GC", "Số lượng", "TT ưu tiên", "Xác nhận cũ", "Xác nhận mới", "Ngày giao hàng", "SL đã xác nhận khi giao hàng", "Nội dung đã xác nhận khi giao hàng"];
    for (let i = 0; i < displayMaxPhieu; i++) h1.push(`Phiếu ${i + 1}`, "");
    ws.addRow(h1);

    // ── Dòng tiêu đề 3: tiêu đề phụ ──
    const h2 = ["", "", "", "", "", "", "", "", "", "", ""];
    for (let i = 0; i < displayMaxPhieu; i++) h2.push("Nội dung lỗi", "SL");
    ws.addRow(h2);

    // Gộp tiêu đề cố định theo chiều dọc (dòng 2-3)
    for (let c = 1; c <= FIXED_COUNT; c++) {
      ws.mergeCells(2, c, 3, c);
    }
    // Gộp "Phiếu N" theo chiều ngang (mỗi phiếu 2 cột)
    for (let i = 0; i < displayMaxPhieu; i++) {
      const startCol = FIXED_COUNT + 1 + i * 2;
      ws.mergeCells(2, startCol, 2, startCol + 1);
    }

    // Định dạng tiêu đề
    const headerStyle = {
      font: { bold: true, size: 11 },
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } },
      border: {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      },
    };
    [2, 3].forEach(rowNum => {
      const row = ws.getRow(rowNum);
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = headerStyle.font;
        cell.alignment = headerStyle.alignment;
        cell.fill = headerStyle.fill;
        cell.border = headerStyle.border;
      });
      row.height = 22;
    });

    // Màu nền tiêu đề phiếu (xen kẽ)
    for (let i = 0; i < displayMaxPhieu; i++) {
      const startCol = FIXED_COUNT + 1 + i * 2;
      const color = i % 2 === 0 ? "FFDBEAFE" : "FFFCE7F3";
      for (let c = startCol; c <= startCol + 1; c++) {
        ws.getCell(2, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
        ws.getCell(3, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      }
    }

    // ── Các dòng dữ liệu ──
    const thinBorder = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
    // Căn chỉnh theo cột cố định: [STT, Order, Tên CT, File GC, SLL, TT, XN cũ, XN mới, Ngày GH, SL đã XN, ND đã XN]
    const fixedAlign = [
      { horizontal: "center", vertical: "middle", wrapText: true },  // STT
      { horizontal: "left", vertical: "top", wrapText: true },      // Order KD
      { horizontal: "left", vertical: "top", wrapText: true },      // Tên chi tiết
      { horizontal: "center", vertical: "top", wrapText: true },    // File GC
      { horizontal: "center", vertical: "middle", wrapText: true }, // Số lượng
      { horizontal: "center", vertical: "middle", wrapText: true }, // TT ưu tiên
      { horizontal: "left", vertical: "top", wrapText: true },      // Xác nhận cũ
      { horizontal: "left", vertical: "top", wrapText: true },      // Xác nhận mới
      { horizontal: "center", vertical: "middle", wrapText: true }, // Ngày giao hàng
      { horizontal: "center", vertical: "middle", wrapText: true }, // SL đã xác nhận khi giao hàng
      { horizontal: "left", vertical: "top", wrapText: true },      // Nội dung đã xác nhận khi giao hàng
    ];
    // Căn chỉnh theo cột phụ của phiếu: [Nội dung lỗi, SL]
    const phieuAlign = [
      { horizontal: "left", vertical: "top", wrapText: true },      // Nội dung lỗi
      { horizontal: "center", vertical: "top", wrapText: true },    // SL
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
        r.ngay_giao_hang ? toVNDate(r.ngay_giao_hang) : "",
        r.sl_da_xac_nhan_gh || "",
        r.noi_dung_da_xac_nhan_gh || "",
      ];

      let maxLines = 1;
      for (let i = 0; i < displayMaxPhieu; i++) {
        const p = r.phieus[i];
        if (p) {
          const nds = p.noiDungs.filter(nd => nd.noi_dung_loi);
          const ndText = nds.map(nd => nd.noi_dung_loi).join("\n");
          const slText = nds.map(nd => String(nd.sl_loi)).join("\n");

          rowData.push(ndText, slText);
          if (nds.length > maxLines) maxLines = nds.length;
        } else {
          rowData.push("", "");
        }
      }


      const excelRow = ws.addRow(rowData);
      excelRow.height = Math.max(16, maxLines * 15);

      // Áp dụng căn chỉnh, viền, font cho từng cột
      excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = thinBorder;
        cell.font = { size: 11 };
        if (colNumber <= FIXED_COUNT) {
          cell.alignment = fixedAlign[colNumber - 1] || fixedAlign[0];
        } else {
          // Chỉ mục cột phụ phiếu: 0=Nội dung, 1=SL
          const subIdx = (colNumber - FIXED_COUNT - 1) % 2;
          cell.alignment = phieuAlign[subIdx];
        }
      });

      // Nền vàng cho các cột phiếu có nội dung
      for (let i = 0; i < displayMaxPhieu; i++) {
        const p = r.phieus[i];
        if (p && p.noiDungs.length > 0) {
          const startCol = FIXED_COUNT + 1 + i * 2;
          const color = "FFFFFDE7";
          for (let c = startCol; c <= startCol + 1; c++) {
            excelRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
          }
        }
      }
    });

    // ── Độ rộng cột ──
    const colWidths = [4, 12, 15, 8, 8, 9, 14, 16, 14, 12, 22];
    for (let i = 0; i < displayMaxPhieu; i++) {
      colWidths.push(18, 4); // Nội dung lỗi, SL
    }
    colWidths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    // ── Tải xuống ──
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Hop_KHHT_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
      {/* ── Thanh công cụ ── */}
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

      {/* ── Bảng dữ liệu ── */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
          fontFamily: "var(--font-inter), Inter, sans-serif",
        }}>
          <thead>
            {/* Dòng 1: Tiêu đề cố định (rowSpan=2) + Tiêu đề gộp Phiếu N */}
            <tr>
              <Th style={{ minWidth: 40, textAlign: "center", rowSpan: 2 }}>STT</Th>
              <Th style={{ minWidth: 110, rowSpan: 2 }}>Order KD</Th>
              <Th style={{ minWidth: 140, rowSpan: 2 }}>Tên chi tiết</Th>
              <Th style={{ minWidth: 80, textAlign: "center", rowSpan: 2 }}>File GC</Th>
              <Th style={{ minWidth: 70, textAlign: "center", rowSpan: 2 }}>Số lượng</Th>
              <Th style={{ minWidth: 60, textAlign: "center", rowSpan: 2 }}>TT ưu tiên</Th>
              <Th style={{ minWidth: 120, rowSpan: 2 }}>Xác nhận cũ</Th>
              <Th style={{ minWidth: 120, rowSpan: 2 }}>Xác nhận mới</Th>
              <Th style={{ minWidth: 110, textAlign: "center", rowSpan: 2 }}>Ngày giao hàng</Th>
              <Th style={{ minWidth: 80, textAlign: "center", rowSpan: 2 }}>SL đã XN khi GH</Th>
              <Th style={{ minWidth: 160, rowSpan: 2 }}>ND đã XN khi GH</Th>
              <Th style={{ minWidth: 200, background: "#fef9c3", color: "#854d0e", rowSpan: 2 }}>Tóm tắt nội dung lỗi</Th>
              <Th style={{ minWidth: 60, textAlign: "center", background: "#fef9c3", color: "#854d0e", rowSpan: 2 }}>SL lỗi</Th>
              {Array.from({ length: displayMaxPhieu }, (_, i) => (
                <th key={`ph_${i}`} colSpan={5} style={{
                  padding: "8px 10px",
                  background: i % 2 === 0 ? "#f0f9ff" : "#fdf2f8",
                  borderBottom: "1px solid #e2e8f0",
                  borderRight: "1px solid #e2e8f0",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#334155",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}>
                  Phiếu {i + 1}
                </th>
              ))}

            </tr>
            {/* Dòng 2: Tiêu đề cột phụ cho từng Phiếu */}
            {displayMaxPhieu > 0 && (
              <tr>
                {Array.from({ length: displayMaxPhieu }, (_, i) => {
                  const bg = i % 2 === 0 ? "#f0f9ff" : "#fdf2f8";
                  return [
                    <th key={`sub_${i}_nd`} style={{ padding: "4px 8px", background: bg, borderBottom: "2px solid #e2e8f0", borderRight: "1px solid #e2e8f0", fontSize: 11, fontWeight: 600, color: "#64748b", textAlign: "left", whiteSpace: "nowrap", position: "sticky", top: 34, zIndex: 1, minWidth: 160 }}>Nội dung lỗi</th>,
                    <th key={`sub_${i}_sl`} style={{ padding: "4px 6px", background: bg, borderBottom: "2px solid #e2e8f0", borderRight: "1px solid #e2e8f0", fontSize: 11, fontWeight: 600, color: "#64748b", textAlign: "center", whiteSpace: "nowrap", position: "sticky", top: 34, zIndex: 1, minWidth: 40 }}>SL</th>,
                    <th key={`sub_${i}_nps`} style={{ padding: "4px 6px", background: bg, borderBottom: "2px solid #e2e8f0", borderRight: "1px solid #e2e8f0", fontSize: 11, fontWeight: 600, color: "#64748b", textAlign: "center", whiteSpace: "nowrap", position: "sticky", top: 34, zIndex: 1, minWidth: 80 }}>Nơi phát sinh</th>,
                    <th key={`sub_${i}_nxl`} style={{ padding: "4px 6px", background: bg, borderBottom: "2px solid #e2e8f0", borderRight: "1px solid #e2e8f0", fontSize: 11, fontWeight: 600, color: "#166534", textAlign: "center", whiteSpace: "nowrap", position: "sticky", top: 34, zIndex: 1, minWidth: 90, backgroundColor: i % 2 === 0 ? "#f0fdf4" : "#f0fdf4" }}>Nơi xử lý lỗi</th>,
                    <th key={`sub_${i}_sll`} style={{ padding: "4px 6px", background: "#fef9c3", borderBottom: "2px solid #e2e8f0", borderRight: "1px solid #e2e8f0", fontSize: 11, fontWeight: 600, color: "#854d0e", textAlign: "center", whiteSpace: "nowrap", position: "sticky", top: 34, zIndex: 1, minWidth: 80 }}>Số lần lỗi</th>,
                  ];
                })}
              </tr>
            )}
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
                <Td style={{ textAlign: "center", fontSize: 11, color: "#1e293b", fontWeight: 500 }}>{row.ngay_giao_hang ? toVNDate(row.ngay_giao_hang) : "—"}</Td>
                <Td style={{ textAlign: "center", fontSize: 11, color: "#1e293b", fontWeight: 600 }}>{row.sl_da_xac_nhan_gh || "—"}</Td>
                <Td style={{ fontSize: 11, color: "#4b5563" }}>{row.noi_dung_da_xac_nhan_gh || "—"}</Td>
                {/* Tóm tắt (nền vàng) */}
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
                {Array.from({ length: displayMaxPhieu }, (_, i) => {
                  const p = row.phieus[i];
                  const bg = i % 2 === 0 ? "#f8fcff" : "#fef7fa";
                  if (!p) return [
                    <Td key={`p_${i}_nd`} style={{ background: bg }} />,
                    <Td key={`p_${i}_sl`} style={{ background: bg }} />,
                    <Td key={`p_${i}_nps`} style={{ background: bg }} />,
                    <Td key={`p_${i}_nxl`} style={{ background: bg }} />,
                    <Td key={`p_${i}_sll`} style={{ background: bg }} />,
                  ];
                  // Lấy danh sách nơi xử lý lỗi duy nhất cho phiếu này
                  const nxlSet = new Set(p.noiDungs.map(nd => nd.noi_xu_ly_loi).filter(Boolean));
                  const nxlArr = [...nxlSet];
                  return [
                    <Td key={`p_${i}_nd`} style={{ background: bg, verticalAlign: "top" }}>
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
                    </Td>,
                    <Td key={`p_${i}_sl`} style={{ background: bg, textAlign: "center", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {p.noiDungs.map((nd, ni) => (
                          <span key={ni} style={{ fontSize: 11, fontWeight: 600, color: "#dc2626" }}>{nd.sl_loi}</span>
                        ))}
                      </div>
                    </Td>,
                    <Td key={`p_${i}_nps`} style={{ background: bg, textAlign: "center", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {p.noiDungs.map((nd, ni) => (
                          nd.noi_phat_sinh
                            ? <span key={ni} style={{ padding: "0 5px", borderRadius: 4, fontSize: 9, fontWeight: 600, background: "#e0e7ff", color: "#3730a3", whiteSpace: "nowrap" }}>{nd.noi_phat_sinh}</span>
                            : <span key={ni} style={{ color: "#d1d5db" }}>—</span>
                        ))}
                      </div>
                    </Td>,
                    <Td key={`p_${i}_nxl`} style={{ background: bg, textAlign: "center", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                        {nxlArr.length > 0 ? nxlArr.map((v, vi) => (
                          <span key={vi} style={{
                            padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                            background: "#dcfce7", color: "#166534", whiteSpace: "nowrap",
                          }}>{v}</span>
                        )) : <span style={{ color: "#d1d5db" }}>—</span>}
                      </div>
                    </Td>,
                    <Td key={`p_${i}_sll`} style={{ background: "#fffde7", textAlign: "center", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                        {p.noiDungs.map((nd, ni) => (
                          <span key={ni} style={{
                            fontSize: 11, fontWeight: 600, color: "#854d0e", whiteSpace: "nowrap",
                          }}>
                            {nd.so_lan} lần
                          </span>
                        ))}
                      </div>
                    </Td>,
                  ];
                })}

              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={13 + displayMaxPhieu * 5} style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
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

/* ── Các thành phần ô bảng ── */
function Th({ children, style = {} }) {
  const { rowSpan, ...cssStyle } = style;
  return (
    <th rowSpan={rowSpan} style={{
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
      ...cssStyle,
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
