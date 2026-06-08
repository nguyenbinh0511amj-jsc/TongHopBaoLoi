import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const options = {};

let client;
let clientPromise;

if (!uri) {
  throw new Error("MONGODB_URI chưa được định nghĩa trong biến môi trường");
}

if (process.env.NODE_ENV === "development") {
  // Trong môi trường phát triển, dùng biến toàn cục để giữ kết nối qua các lần HMR
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // Trong môi trường sản xuất, tạo client mới cho mỗi instance
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
