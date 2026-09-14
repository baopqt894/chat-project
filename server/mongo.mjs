import { MongoClient } from "mongodb";
let connection;
let selectedDatabase;
export async function database() {
  if (!process.env.MONGODB_URI) {
    throw Object.assign(
      new Error(
        "Chưa cấu hình MONGODB_URI. Thêm biến này trong Vercel → Settings → Environment Variables rồi redeploy.",
      ),
      { status: 503, code: "DATABASE_NOT_CONFIGURED" },
    );
  }
  if (!connection) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
    });
    connection = client.connect().catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  selectedDatabase ??= (await connection).db(process.env.MONGODB_DB || "gather_demo");
  return selectedDatabase;
}
