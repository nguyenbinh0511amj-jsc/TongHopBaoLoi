// AppSheet REST API - CRUD + Stale-While-Revalidate Cache
import { NextResponse } from "next/server";

const APP_ID = process.env.APPSHEET_APP_ID;
const ACCESS_KEY = process.env.APPSHEET_ACCESS_KEY;
const BASE_URL = `https://api.appsheet.com/api/v2/apps/${APP_ID}/tables`;

function hdrs() {
  return { ApplicationAccessKey: ACCESS_KEY, "Content-Type": "application/json" };
}

// ═══════════════════════════════════════════════════════
// CACHE: Stale-While-Revalidate pattern
// - Always return cached data instantly (even if stale)
// - Refresh in background when TTL expires
// ═══════════════════════════════════════════════════════
const cache = new Map();        // { table: { data, timestamp } }
const refreshing = new Set();   // tables currently being refreshed

const CACHE_TTL = {
  san_pham: 10 * 60 * 1000,            // 10 min (rarely changes)
  thoi_gian_hoan_thanh: 10 * 60 * 1000, // 10 min (49k rows)
  don_hang: 3 * 60 * 1000,
  tong_hop_loi: 60 * 1000,              // 1 min — cần update nhanh
  so_giao_nhan: 60 * 1000,              // 1 min — cần update nhanh
  xac_nhan_ke_hoach: 3 * 60 * 1000,
  phieu_bao_loi: 2 * 60 * 1000,        // 2 min
  Giao_Hang_PSX: 3 * 60 * 1000,
  nhan_vien: 10 * 60 * 1000,           // 10 min — rarely changes
  ke_hoach_pkt_dt: 2 * 60 * 1000,      // 2 min — chi tiết tiến độ QLCL
  ke_hoach_pkt: 2 * 60 * 1000,          // 2 min — so_file lookup

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

// Strip heavy columns to reduce JSON payload
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
  return res.json();
}

// Background refresh — non-blocking, deduped
function backgroundRefresh(table) {
  if (refreshing.has(table)) return; // already refreshing
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
// Warm-up: pre-load all tables on first request
// ═══════════════════════════════════════════════════════
let warmedUp = false;
const ALL_TABLES = [
  "so_giao_nhan",
  "tong_hop_loi",
  "phieu_bao_loi",
  "xac_nhan_ke_hoach",
];

function warmUpAll() {
  if (warmedUp) return;
  warmedUp = true;
  // Fetch all tables in parallel — no delay
  ALL_TABLES.forEach(t => {
    if (!cache.has(t)) backgroundRefresh(t);
  });
}

// Fetch multiple tables in parallel, return combined result
async function fetchMultipleTables(tables) {
  const results = {};
  await Promise.all(tables.map(async (t) => {
    const entry = getCacheEntry(t);
    if (entry) {
      // Return cache, refresh in background if stale
      if (!isFresh(t)) backgroundRefresh(t);
      results[t] = entry.data;
    } else {
      // No cache — fetch synchronously
      const data = await fetchFromAppSheet(t);
      const cleaned = cleanRows(data);
      if (Array.isArray(cleaned)) setCache(t, cleaned);
      results[t] = cleaned;
    }
  }));
  return results;
}

/**
 * GET /api/appsheet?table=don_hang         → SWR cached data
 * GET /api/appsheet?table=don_hang&fresh=1 → Force refresh
 * GET /api/appsheet?tables=1               → Test connection
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

    // ── Combined multi-table fetch: ?multi=tong_hop_loi,so_giao_nhan ──
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

    // Trigger warm-up of ALL tables on first request
    warmUpAll();

    // ── Invalidate: clear cache + force fresh fetch ──
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

    // ── Stale-While-Revalidate ──
    const entry = getCacheEntry(table);

    if (!fresh && entry) {
      // Have cached data → return immediately
      if (!isFresh(table)) {
        // Stale → trigger background refresh
        backgroundRefresh(table);
      }
      return NextResponse.json({
        table, totalRows: entry.data.length, rows: entry.data, cached: true,
      });
    }

    // No cache or forced fresh → fetch synchronously
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
    // On error, still return stale cache if available
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
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { table, action = "Find", rows = [], selector } = body;

    if (!table) return NextResponse.json({ error: "Thiếu 'table'" }, { status: 400 });
    if (!APP_ID || !ACCESS_KEY) return NextResponse.json({ error: "Thiếu credentials" }, { status: 500 });

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

    // Clear cache + trigger background refresh after mutation
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
