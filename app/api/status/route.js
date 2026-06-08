import clientPromise from "../../lib/mongodb";
import { NextResponse } from "next/server";

const DB_NAME = "tonghopbaoloi";
const COLLECTION = "status";
const DOC_ID = "theodoi_status_data";

async function getCollection() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection(COLLECTION);
}

// GET — lấy tất cả dữ liệu trạng thái
export async function GET() {
  try {
    const col = await getCollection();
    const doc = await col.findOne({ _id: DOC_ID });
    const data = doc?.data || {};
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("Lỗi MongoDB GET:", err);
    return NextResponse.json({ ok: false, data: {}, error: err.message }, { status: 500 });
  }
}

// POST — cập nhật một khóa hoặc gộp nhiều khóa
// Body: { key: "tenCT|||noiPS", field: "tinh_trang", value: "..." }
// HOẶC: { merge: { "khóa1": { tinh_trang: "...", ... }, "khóa2": { ... } } }
// HOẶC: { deleteKey: "tenCT|||noiPS" }
export async function POST(request) {
  try {
    const body = await request.json();
    const col = await getCollection();

    // Lấy dữ liệu hiện tại
    const doc = await col.findOne({ _id: DOC_ID });
    let current = doc?.data || {};

    if (body.merge) {
      // Gộp nhiều khóa cùng lúc
      for (const [key, fields] of Object.entries(body.merge)) {
        current[key] = { ...(current[key] || {}), ...fields };
        // Dọn dẹp các mục trống
        const entry = current[key];
        if (!entry.tinh_trang && !entry.thoi_han && !entry.ngay_yeu_cau && !entry.ngay_hoan_thanh && !entry.loai_bo) {
          delete current[key];
        }
      }
    } else if (body.key && body.field !== undefined) {
      // Cập nhật một trường
      if (!current[body.key]) current[body.key] = {};
      current[body.key][body.field] = body.value;

      // Dọn dẹp nếu tất cả trường đều trống
      const entry = current[body.key];
      if (!entry.tinh_trang && !entry.thoi_han && !entry.ngay_yeu_cau && !entry.ngay_hoan_thanh && !entry.loai_bo) {
        delete current[body.key];
      }
    } else if (body.deleteKey) {
      delete current[body.deleteKey];
    }

    // Cập nhật hoặc tạo mới tài liệu
    await col.updateOne(
      { _id: DOC_ID },
      { $set: { data: current, updatedAt: new Date() } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, data: current });
  } catch (err) {
    console.error("Lỗi MongoDB POST:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
