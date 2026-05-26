import { MongoClient } from "mongodb";
import { readFileSync } from "fs";
import { resolve } from "path";

// Manually parse .env.local
const envContent = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
const envVars = {};
envContent.split("\n").forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const uri = envVars.MONGODB_URI;
console.log("URI:", uri?.replace(/:[^@]+@/, ":****@"));

async function test() {
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    console.log("Connecting...");
    await client.connect();
    console.log("✅ Connected successfully!");
    
    const db = client.db("tonghopbaoloi");
    const col = db.collection("status");
    const doc = await col.findOne({ _id: "theodoi_status_data" });
    console.log("Status doc:", JSON.stringify(doc, null, 2));
    
    await client.close();
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error("Code:", err.code);
    console.error("CodeName:", err.codeName);
  }
}

test();
