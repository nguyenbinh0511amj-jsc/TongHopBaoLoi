// AppSheet REST API - CRUD + Bộ nhớ đệm kiểu Cũ-Trong-Khi-Làm-Mới
import { NextResponse } from "next/server";

const APP_ID = process.env.APPSHEET_APP_ID;
const ACCESS_KEY = process.env.APPSHEET_ACCESS_KEY;
const BASE_URL = `https://api.appsheet.com/api/v2/apps/${APP_ID}/tables`;

function hdrs() {
  return { ApplicationAccessKey: ACCESS_KEY, "Content-Type": "application/json" };
}

// ═══════════════════════════════════════════════════════
// BỘ NHỚ ĐỆM: Mô hình Cũ-Trong-Khi-Làm-Mới
// - Luôn trả dữ liệu đệm ngay lập tức (kể cả khi đã cũ)
// - Làm mới ngầm khi hết thời gian sống (TTL)
// ═══════════════════════════════════════════════════════
const cache = new Map();        // { bảng: { dữ_liệu, thời_điểm } }
const refreshing = new Set();   // các bảng đang được làm mới

const CACHE_TTL = {
  san_pham: 10 * 60 * 1000,            // 10 phút (ít thay đổi)
  thoi_gian_hoan_thanh: 10 * 60 * 1000, // 10 phút (49k dòng)
  don_hang: 3 * 60 * 1000,
  tong_hop_loi: 60 * 1000,              // 1 min — cần update nhanh
  so_giao_nhan: 60 * 1000,              // 1 min — cần update nhanh
  xac_nhan_ke_hoach: 3 * 60 * 1000,
  Giao_Hang_PSX: 3 * 60 * 1000,
  nhan_vien: 10 * 60 * 1000,           // 10 phút — ít thay đổi
  ke_hoach_pkt_dt: 2 * 60 * 1000,      // 2 phút — chi tiết tiến độ QLCL
  ke_hoach_pkt: 2 * 60 * 1000,          // 2 phút — tra cứu so_file

};
const DEFAULT_TTL = 60 * 1000;

function getTTL(table) { return CACHE_TTL[table] || DEFAULT_TTL; }

function getCacheEntry(table) { return cache.get(table) || null; }

function isFresh(table) {
  const e = cache.get(table);
  return e && (Date.now() - e.timestamp < getTTL(table));
}

function setCache(table, data) {
  cache.set(table, { data, timestamp: Date.now() });
}

function clearCache(table) {
  if (table) cache.delete(table);
  else cache.clear();
}

// Loại bỏ các cột nặng để giảm kích thước JSON
function cleanRows(data) {
  if (!Array.isArray(data)) return data;
  return data.map(row => {
    const r = {};
    for (const [k, v] of Object.entries(row)) {
      if (!k.startsWith("Related ") || (typeof v === "string" && v.length < 100)) {
        r[k] = v;
      }
    }
    return r;
  });
}

async function fetchFromAppSheet(table) {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(table)}/Action`, {
    method: "POST",
    headers: hdrs(),
    body: JSON.stringify({
      Action: "Find",
      Properties: {
        Locale: "vi-VN",
        Timezone: "Asia/Ho_Chi_Minh",
        Selector: `Filter(${table}, true)`,
      },
      Rows: [],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AppSheet lỗi ${res.status}: ${err}`);
  }
  const text = await res.text();
  if (!text || text.trim() === "") {
    console.warn(`[AppSheet API] Bảng '${table}' trả về phản hồi rỗng.`);
    return [];
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`[AppSheet API] Lỗi parse JSON cho bảng '${table}':`, err.message);
    return [];
  }
}

// Làm mới ngầm — không chặn, tránh trùng lặp
function backgroundRefresh(table) {
  if (refreshing.has(table)) return; // đang làm mới rồi
  refreshing.add(table);
  fetchFromAppSheet(table)
    .then(data => {
      const cleaned = cleanRows(data);
      if (Array.isArray(cleaned)) setCache(table, cleaned);
    })
    .catch(err => console.error(`[BG refresh ${table}]`, err.message))
    .finally(() => refreshing.delete(table));
}

// ═══════════════════════════════════════════════════════
// Khởi động nóng: tải trước tất cả bảng khi có yêu cầu đầu tiên
// ═══════════════════════════════════════════════════════
let warmedUp = false;
const ALL_TABLES = [
  "so_giao_nhan",
  "tong_hop_loi",
  "xac_nhan_ke_hoach",
  "Giao_Hang_PSX",
];

function warmUpAll() {
  if (warmedUp) return;
  warmedUp = true;
  // Tải tất cả bảng song song — không chờ đợi
  ALL_TABLES.forEach(t => {
    if (!cache.has(t)) backgroundRefresh(t);
  });
}

// Tải nhiều bảng song song, trả kết quả gộp
async function fetchMultipleTables(tables) {
  const results = {};
  await Promise.all(tables.map(async (t) => {
    try {
      const entry = getCacheEntry(t);
      if (entry) {
        // Trả dữ liệu đệm, làm mới ngầm nếu đã cũ
        if (!isFresh(t)) backgroundRefresh(t);
        results[t] = entry.data;
      } else {
        // Không có đệm — tải đồng bộ
        const data = await fetchFromAppSheet(t);
        const cleaned = cleanRows(data);
        if (Array.isArray(cleaned)) setCache(t, cleaned);
        results[t] = cleaned || [];
      }
    } catch (err) {
      console.error(`[fetchMultipleTables] Lỗi khi tải bảng '${t}':`, err.message);
      results[t] = [];
    }
  }));
  return results;
}

/**
 * GET /api/appsheet?table=don_hang         → Dữ liệu đệm SWR
 * GET /api/appsheet?table=don_hang&fresh=1 → Buộc làm mới
 * GET /api/appsheet?tables=1               → Kiểm tra kết nối
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");
    const fresh = searchParams.get("fresh") === "1";
    const invalidate = searchParams.get("invalidate") === "1";

    if (!APP_ID || !ACCESS_KEY) {
      return NextResponse.json({ error: "Thiếu APPSHEET_APP_ID hoặc APPSHEET_ACCESS_KEY" }, { status: 500 });
    }

    if (searchParams.get("tables") === "1") {
      return NextResponse.json({ status: "ok", appId: APP_ID });
    }

    // ── Tải gộp nhiều bảng: ?multi=tong_hop_loi,so_giao_nhan ──
    const multi = searchParams.get("multi");
    if (multi) {
      warmUpAll();
      const tables = multi.split(",").map(t => t.trim()).filter(Boolean);
      const results = await fetchMultipleTables(tables);
      return NextResponse.json({ ok: true, results });
    }

    if (!table) {
      return NextResponse.json({ error: "Thiếu ?table=TenBang" }, { status: 400 });
    }

    // Khởi động nóng TẤT CẢ bảng khi có yêu cầu đầu tiên
    warmUpAll();

    // ── Xóa đệm: xóa cache + buộc tải mới ──
    if (invalidate) {
      clearCache(table);
      const data = await fetchFromAppSheet(table);
      const cleaned = cleanRows(data);
      if (Array.isArray(cleaned)) setCache(table, cleaned);
      return NextResponse.json({
        table,
        totalRows: Array.isArray(cleaned) ? cleaned.length : 0,
        rows: cleaned,
        cached: false,
        invalidated: true,
      });
    }

    // ── Cũ-Trong-Khi-Làm-Mới ──
    const entry = getCacheEntry(table);

    if (!fresh && entry) {
      // Có dữ liệu đệm → trả về ngay
      if (!isFresh(table)) {
        // Đã cũ → kích hoạt làm mới ngầm
        backgroundRefresh(table);
      }
      return NextResponse.json({
        table, totalRows: entry.data.length, rows: entry.data, cached: true,
      });
    }

    // Không có đệm hoặc buộc làm mới → tải đồng bộ
    const data = await fetchFromAppSheet(table);
    const cleaned = cleanRows(data);
    if (Array.isArray(cleaned)) setCache(table, cleaned);

    return NextResponse.json({
      table,
      totalRows: Array.isArray(cleaned) ? cleaned.length : 0,
      rows: cleaned,
      cached: false,
    });
  } catch (error) {
    // Khi lỗi, vẫn trả dữ liệu đệm cũ nếu có
    const url = new URL(request.url);
    const fallbackTable = url.searchParams?.get?.("table");
    const entry = fallbackTable ? getCacheEntry(fallbackTable) : null;
    if (entry) {
      return NextResponse.json({
        table: "fallback", totalRows: entry.data.length, rows: entry.data,
        cached: true, stale: true,
      });
    }
    return NextResponse.json({ error: "Lỗi server", detail: error.message }, { status: 500 });
  }
}

/**
 * POST /api/appsheet
 * { table, action: "Add"|"Edit"|"Delete"|"Find", rows, selector }
 * Thêm / Sửa / Xóa / Tìm kiếm dữ liệu trên AppSheet
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { table, action = "Find", rows = [], selector } = body;

    if (!table) return NextResponse.json({ error: "Thiếu 'table'" }, { status: 400 });
    if (!APP_ID || !ACCESS_KEY) return NextResponse.json({ error: "Thiếu thông tin xác thực" }, { status: 500 });

    const payload = {
      Action: action,
      Properties: { Locale: "vi-VN", Timezone: "Asia/Ho_Chi_Minh" },
      Rows: rows,
    };
    if (selector) payload.Properties.Selector = selector;

    const res = await fetch(`${BASE_URL}/${encodeURIComponent(table)}/Action`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AppSheet lỗi: ${res.status}`, detail: err, action }, { status: res.status });
    }

    const data = await res.json();

    // Xóa đệm + kích hoạt làm mới ngầm sau khi thay đổi dữ liệu
    if (["Add", "Edit", "Delete"].includes(action)) {
      clearCache(table);
      backgroundRefresh(table);
    }

    return NextResponse.json({
      success: true, action, table,
      totalRows: Array.isArray(data) ? data.length : (data ? 1 : 0),
      rows: Array.isArray(data) ? data : (data ? [data] : []),
    });
  } catch (error) {
    return NextResponse.json({ error: "Lỗi server", detail: error.message }, { status: 500 });
  }
}
