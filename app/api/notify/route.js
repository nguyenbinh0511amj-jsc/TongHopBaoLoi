import { NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Rate limit: track last sent time
let lastSentAt = 0;
const MIN_INTERVAL = 30 * 1000; // 30 seconds

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error("Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID");
  }

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const json = await res.json();
  if (!json.ok) throw new Error(json.description || "Telegram API error");
  return json;
}

// Telegram has 4096 char limit per message, split if needed
async function sendLongMessage(text) {
  const MAX_LEN = 4000;
  if (text.length <= MAX_LEN) {
    return sendTelegram(text);
  }
  // Split by lines, send in chunks
  const lines = text.split("\n");
  let chunk = "";
  for (const line of lines) {
    if ((chunk + "\n" + line).length > MAX_LEN && chunk) {
      await sendTelegram(chunk);
      chunk = line;
    } else {
      chunk += (chunk ? "\n" : "") + line;
    }
  }
  if (chunk) await sendTelegram(chunk);
}

/**
 * POST /api/notify
 * Body: { type: "summary", stats, items }
 *    or { type: "status_change", ... }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { type } = body;

    if (!BOT_TOKEN || !CHAT_ID) {
      return NextResponse.json({ ok: false, error: "Chưa cấu hình Telegram Bot" }, { status: 500 });
    }

    // ── Summary report ──
    if (type === "summary") {
      // Rate limit check
      const now = Date.now();
      if (now - lastSentAt < MIN_INTERVAL) {
        const wait = Math.ceil((MIN_INTERVAL - (now - lastSentAt)) / 1000);
        return NextResponse.json({ ok: false, error: `Vui lòng đợi ${wait}s trước khi gửi lại` }, { status: 429 });
      }

      const { stats, items = [] } = body;

      let msg = `📊 <b>BÁO CÁO TÌNH TRẠNG BÁO LỖI</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━\n`;
      msg += `🕐 ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}\n\n`;

      if (stats) {
        msg += `Tổng: <b>${stats.total || 0}</b> │ Yêu cầu: <b>${stats.yeuCau || 0}</b> │ Hoàn thành: <b>${stats.hoanThanh || 0}</b> │ Quá hạn: <b>${stats.quaHan || 0}</b>\n`;
        msg += `\n🔗 <a href="https://tong-hop-bao-loi.vercel.app/">Xem chi tiết tại đây</a>\n`;
      }

      if (items.length > 0) {
        msg += `\n━━━━━━━━━━━━━━━━━━━\n`;
        msg += `<b>CHI TIẾT (${items.length} mục):</b>\n`;

        items.forEach((item, i) => {
          msg += `\n<b>${i + 1}. ${item.ten_chi_tiet}</b>\n${item.detail || ""}\n`;
        });
      } else {
        msg += `\nKhông có mục nào trong báo cáo.`;
      }

      await sendLongMessage(msg);
      lastSentAt = Date.now();
      return NextResponse.json({ ok: true, message: "Đã gửi báo cáo qua Telegram" });
    }

    // ── Status change notification ──
    if (type === "status_change") {
      const { tenChiTiet, noiPhatSinh, tinhTrang, thoiHan, soFiles } = body;

      let emoji = tinhTrang === "Yêu cầu báo lỗi" ? "📋" : "✅";
      let msg = `${emoji} <b>${tinhTrang?.toUpperCase()}</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📦 Chi tiết: <b>${tenChiTiet}</b>\n`;
      if (noiPhatSinh) msg += `📍 Vị trí: ${noiPhatSinh}\n`;
      if (soFiles) msg += `📄 Số file: ${soFiles}\n`;
      if (thoiHan) msg += `⏰ Thời hạn: ${thoiHan}\n`;
      msg += `🕐 ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`;

      await sendTelegram(msg);
      return NextResponse.json({ ok: true, message: "Đã gửi thông báo" });
    }

    return NextResponse.json({ ok: false, error: "Invalid type" }, { status: 400 });
  } catch (err) {
    console.error("Notify error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
