import clientPromise from "../../lib/mongodb";
import { NextResponse } from "next/server";

const DB_NAME = "tonghopbaoloi";
const COLLECTION = "status";
const DOC_ID = "theodoi_status_data";

async function getCollection() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection(COLLECTION);
}

// GET — fetch all status data
export async function GET() {
  try {
    const col = await getCollection();
    const doc = await col.findOne({ _id: DOC_ID });
    const data = doc?.data || {};
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("MongoDB GET error:", err);
    return NextResponse.json({ ok: false, data: {}, error: err.message }, { status: 500 });
  }
}

// POST — update a single key or merge multiple keys
// Body: { key: "tenCT|||noiPS", field: "tinh_trang", value: "..." }
// OR:   { merge: { "key1": { tinh_trang: "...", ... }, "key2": { ... } } }
// OR:   { deleteKey: "tenCT|||noiPS" }
export async function POST(request) {
  try {
    const body = await request.json();
    const col = await getCollection();

    // Get current data
    const doc = await col.findOne({ _id: DOC_ID });
    let current = doc?.data || {};

    if (body.merge) {
      // Merge multiple keys at once
      for (const [key, fields] of Object.entries(body.merge)) {
        current[key] = { ...(current[key] || {}), ...fields };
        // Clean up empty entries
        const entry = current[key];
        if (!entry.tinh_trang && !entry.thoi_han && !entry.ngay_yeu_cau && !entry.ngay_hoan_thanh) {
          delete current[key];
        }
      }
    } else if (body.key && body.field !== undefined) {
      // Update single field
      if (!current[body.key]) current[body.key] = {};
      current[body.key][body.field] = body.value;

      // Clean up if all fields empty
      const entry = current[body.key];
      if (!entry.tinh_trang && !entry.thoi_han && !entry.ngay_yeu_cau && !entry.ngay_hoan_thanh) {
        delete current[body.key];
      }
    } else if (body.deleteKey) {
      delete current[body.deleteKey];
    }

    // Upsert the document
    await col.updateOne(
      { _id: DOC_ID },
      { $set: { data: current, updatedAt: new Date() } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, data: current });
  } catch (err) {
    console.error("MongoDB POST error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
