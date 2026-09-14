import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { backend } from "./backend.mjs";
import { database } from "./mongo.mjs";
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (status, data, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, ...extra },
  });
const error = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const indexes = new WeakMap();
async function prepare(db) {
  if (!indexes.has(db))
    indexes.set(
      db,
      Promise.all([
        db
          .collection("presence")
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db
          .collection("events")
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("events").createIndex({ to: 1, createdAt: 1 }),
      ]).catch((e) => {
        indexes.delete(db);
        throw e;
      }),
    );
  await indexes.get(db);
}
async function readBody(request) {
  if (["GET", "HEAD"].includes(request.method)) return "";
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 3 * 1024 * 1024) {
      await reader.cancel();
      error(413, "Ảnh tối đa 2MB trên Vercel.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function invoke(engine, request, raw) {
  const req = Readable.from(raw ? [raw] : []);
  req.url = request.url;
  req.method = request.method;
  req.headers = Object.fromEntries(request.headers);
  req.headers.host = new URL(request.url).host;
  let result;
  const res = {
    writeHead(status, head) {
      result = { status, headers: head };
    },
    end(body) {
      result.body = body;
    },
  };
  await engine.handler(req, res);
  return (
    result || {
      status: 404,
      headers,
      body: JSON.stringify({ error: "API không tồn tại" }),
    }
  );
}
function requestIdentity(request) {
  return { headers: Object.fromEntries(request.headers) };
}
async function realtime(db, engine, request, raw, revision) {
  if (request.method !== "POST")
    return json(405, { error: "Method không hỗ trợ" });
  const user = engine.userFor(requestIdentity(request));
  if (!user) return json(401, { error: "Vui lòng đăng nhập" });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "JSON không hợp lệ" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return json(400, { error: "JSON không hợp lệ" });
  const now = Date.now();
  const expiry = new Date(now + 60000);
  if (body.event === "signal") {
    const value = body.payload;
    const c = value && engine.access(value.channelId, user);
    if (
      c?.kind !== "dm" ||
      !c.members.includes(value.to) ||
      value.to === user.id
    )
      return json(403, { error: "Không có quyền gọi người này" });
    if (
      !value.signal ||
      !["invite", "accept", "offer", "answer", "ice", "end", "busy"].includes(
        value.signal.type,
      ) ||
      JSON.stringify(value.signal).length > 100000
    )
      return json(400, { error: "Signal không hợp lệ" });
    await db
      .collection("events")
      .insertOne({
        _id: randomUUID(),
        to: value.to,
        createdAt: now,
        expiresAt: expiry,
        type: "signal",
        payload: { from: user.id, channelId: c.id, signal: value.signal },
      });
    return json(200, { ok: true });
  }
  if (body.event === "typing") {
    const c = engine.access(body.payload, user);
    if (!c) return json(403, { error: "Không có quyền truy cập" });
    await db
      .collection("events")
      .insertOne({
        _id: randomUUID(),
        recipients: c.members.filter((id) => id !== user.id),
        createdAt: now,
        expiresAt: new Date(now + 4000),
        type: "typing",
        payload: { channelId: c.id, name: user.name },
      });
    return json(200, { ok: true });
  }
  if (body.event) return json(400, { error: "Event không hợp lệ" });
  if (typeof body.clientId !== "string" || body.clientId.length > 80)
    return json(400, { error: "Client không hợp lệ" });
  const session = request.headers.get("cookie") || "";
  const id = createHash("sha256")
    .update(session + "|" + body.clientId)
    .digest("hex");
  await db
    .collection("presence")
    .updateOne(
      { _id: id },
      {
        $set: {
          userId: user.id,
          sessionHash: createHash("sha256").update(session).digest("hex"),
          expiresAt: new Date(now + 15000),
        },
      },
      { upsert: true },
    );
  const online = await db
    .collection("presence")
    .distinct("userId", { expiresAt: { $gt: new Date(now) } });
  const since = Number.isFinite(body.since)
    ? Math.max(body.since - 2000, now - 60000)
    : now;
  const events = await db
    .collection("events")
    .find({
      $or: [{ to: user.id }, { recipients: user.id }],
      createdAt: { $gte: since },
      expiresAt: { $gt: new Date(now) },
    })
    .sort({ createdAt: 1 })
    .limit(300)
    .toArray();
  return json(200, {
    online,
    revision,
    cursor: now,
    events: events
      .filter((e) => engine.access(e.payload.channelId, user))
      .map((e) => ({ id: e._id, type: e.type, payload: e.payload })),
  });
}
// All mutations use compare-and-swap so two Vercel instances cannot overwrite each other.
export async function cloudRequest(request, injectedDatabase) {
  let stage = "request";
  try {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== url.host)
      return json(403, { error: "Origin không hợp lệ" });
    const raw = await readBody(request);
    stage = "database-connect";
    const db = injectedDatabase || (await database());
    stage = "database-indexes";
    await prepare(db);
    stage = "workspace";
    const collection = db.collection("workspaces");
    let doc = await collection.findOne({ _id: "default" });
    if (!doc) {
      const seed = backend(null, undefined, { apiOnly: true }).state;
      await collection.updateOne(
        { _id: "default" },
        { $setOnInsert: { revision: 0, state: seed } },
        { upsert: true },
      );
      doc = await collection.findOne({ _id: "default" });
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt) doc = await collection.findOne({ _id: "default" });
      const engine = backend(null, undefined, {
        apiOnly: true,
        state: structuredClone(doc.state),
      });
      if (url.pathname === "/api/realtime")
        return await realtime(db, engine, request, raw, doc.revision);
      if (url.pathname.startsWith("/api/attachments/")) {
        const user = engine.userFor(requestIdentity(request));
        if (!user) return json(401, { error: "Vui lòng đăng nhập" });
        const id = url.pathname.split("/")[3];
        const message = engine.state.messages.find((m) => m.id === id);
        if (!message || !engine.access(message.channelId, user))
          return json(404, { error: "Không tìm thấy ảnh" });
        const image = await db.collection("attachments").findOne({ _id: id });
        if (!image) return json(404, { error: "Không tìm thấy ảnh" });
        return new Response(Buffer.from(image.base64, "base64"), {
          headers: {
            "Content-Type": image.mime,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      const result = await invoke(engine, request, raw);
      if (result.status >= 400 || !engine.isDirty())
        return new Response(result.body, result);
      // Images live outside the snapshot, keeping workspace responses under Vercel's response limit.
      for (const message of engine.state.messages) {
        if (message.attachment?.data.startsWith("data:")) {
          const [prefix, base64] = message.attachment.data.split(",");
          if (Buffer.byteLength(base64, "base64") > 2 * 1024 * 1024)
            return json(413, { error: "Ảnh tối đa 2MB trên Vercel." });
          await db
            .collection("attachments")
            .updateOne(
              { _id: message.id },
              { $setOnInsert: { base64, mime: prefix.slice(5, -7) } },
              { upsert: true },
            );
          message.attachment.data = `/api/attachments/${message.id}`;
          if (url.pathname === "/api/messages")
            result.body = JSON.stringify(message);
        }
      }
      if (Buffer.byteLength(JSON.stringify(engine.state)) > 3 * 1024 * 1024)
        return json(507, {
          error:
            "Workspace demo đạt giới hạn dữ liệu. Cần phân trang và chuyển sang schema production.",
        });
      const write = await collection.updateOne(
        { _id: "default", revision: doc.revision },
        { $set: { state: engine.state }, $inc: { revision: 1 } },
      );
      if (write.modifiedCount) {
        if (url.pathname === "/api/logout")
          await db.collection("presence").deleteMany({
            sessionHash: createHash("sha256")
              .update(request.headers.get("cookie") || "")
              .digest("hex"),
          });
        return new Response(result.body, result);
      }
    }
    return json(409, { error: "Có thay đổi đồng thời. Vui lòng thử lại." });
  } catch (e) {
    // Never log connection strings, request bodies or cookies.
    console.error("Gather API failure", {
      name: e.name,
      code: e.code || "UNKNOWN",
      stage,
    });
    return json(e.status || 503, {
      error: e.status
        ? e.message
        : "Không kết nối được database. Kiểm tra MONGODB_URI và quyền truy cập mạng của MongoDB.",
      code: e.code === "DATABASE_NOT_CONFIGURED" ? e.code : e.name === "MongoParseError" ? "DATABASE_URI_INVALID" : e.code === 18 || e.code === 8000 ? "DATABASE_AUTH_FAILED" : e.name === "MongoServerSelectionError" ? "DATABASE_UNREACHABLE" : "API_UNAVAILABLE",
      stage,
      errorType: ["MongoParseError", "MongoServerSelectionError", "MongoServerError", "TypeError", "Error"].includes(e.name) ? e.name : "Error",
    });
  }
}
