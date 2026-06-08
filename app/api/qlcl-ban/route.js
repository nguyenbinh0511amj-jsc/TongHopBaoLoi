import clientPromise from "../../lib/mongodb";
import { NextResponse } from "next/server";

const DB_NAME = "tonghopbaoloi";
const COLLECTION = "qlcl_ban";
const DOC_ID = "qlcl_ban_assignment";

async function getCollection() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection(COLLECTION);
}

// GET — lấy phân công bàn: { ban1: [...mã_nv], ban2: [...], ban3: [...] }
export async function GET() {
  try {
    const col = await getCollection();
    const doc = await col.findOne({ _id: DOC_ID });
    const data = doc?.data || { ban1: [], ban2: [], ban3: [], ban4: [] };
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("Lỗi MongoDB GET qlcl-ban:", err);
    return NextResponse.json({ ok: false, data: { ban1: [], ban2: [], ban3: [], ban4: [] }, error: err.message }, { status: 500 });
  }
}

// POST — cập nhật phân công bàn
// Body: { ban: "ban1", codes: ["0001", "0154", ...] }
export async function POST(request) {
  try {
    const body = await request.json();
    const { ban, codes } = body;

    if (!ban || !["ban1", "ban2", "ban3", "ban4"].includes(ban)) {
      return NextResponse.json({ ok: false, error: "Bàn không hợp lệ (ban1|ban2|ban3|ban4)" }, { status: 400 });
    }
    if (!Array.isArray(codes)) {
      return NextResponse.json({ ok: false, error: "codes phải là mảng" }, { status: 400 });
    }

    const col = await getCollection();
    const doc = await col.findOne({ _id: DOC_ID });
    const current = doc?.data || { ban1: [], ban2: [], ban3: [], ban4: [] };

    // Cập nhật bàn được chỉ định
    current[ban] = codes;

    await col.updateOne(
      { _id: DOC_ID },
      { $set: { data: current, updatedAt: new Date() } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, data: current });
  } catch (err) {
    console.error("Lỗi MongoDB POST qlcl-ban:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
