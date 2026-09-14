import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve } from "node:path";
import { Server } from "socket.io";
import { BUILTIN_GIFS, EMOJI_GROUPS } from "../lib/chat-media.mjs";

export function backend(
  server,
  directory = process.env.DATA_DIR || "data",
  options = {},
) {
  const file = options.apiOnly ? null : resolve(directory, "workspace.json");
  if (file) mkdirSync(resolve(directory), { recursive: true });
  let dirty = false;
  const existing =
    options.state ||
    (file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
  const password = (value, salt = randomBytes(16).toString("hex")) =>
    `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
  const verify = (value, hash) => {
    const [salt, key] = hash.split(":");
    return timingSafeEqual(
      Buffer.from(key, "hex"),
      scryptSync(value, salt, 64),
    );
  };
  const people = [
    ["minh", "Minh Anh", "MA", "#c78950"],
    ["linh", "Linh Nguyễn", "LN", "#799a87"],
    ["khoa", "Khoa Trần", "KT", "#718eb9"],
    ["ha", "Hà Phạm", "HP", "#ae829f"],
  ];
  const db = existing
    ? existing
    : {
        users: people.map(([id, name, initials, color]) => ({
          id,
          name,
          initials,
          color,
          email: `${id}@gather.demo`,
          password: password("Demo12345!"),
        })),
        channels: [
          {
            id: "general",
            name: "general",
            description:
              "Nơi cả đội kết nối, chia sẻ và cùng nhau làm nên điều tuyệt vời.",
            kind: "channel",
            members: people.map((p) => p[0]),
          },
          {
            id: "design",
            name: "design",
            description: "Một chút cảm hứng. Một chút pixel perfect.",
            kind: "channel",
            members: people.map((p) => p[0]),
          },
          {
            id: "engineering",
            name: "engineering",
            description: "Build things that matter.",
            kind: "channel",
            members: people.map((p) => p[0]),
          },
          {
            id: "random",
            name: "random",
            description: "Chuyện ngoài công việc ☕",
            kind: "channel",
            members: people.map((p) => p[0]),
          },
        ],
        messages: [],
        sessions: [],
      };
  if (!existing) {
    const texts = [
      [
        "minh",
        "Chào buổi sáng cả nhà! 👋\nChào mừng đến với không gian làm việc mới của chúng mình.",
      ],
      [
        "linh",
        "Mình vừa hoàn thiện bản thiết kế cho workspace. Mọi người cùng xem và góp ý nhé! ✨",
      ],
      [
        "khoa",
        "Rất thích cách mọi thứ được gom vào một nơi. Từ giờ trao đổi công việc ở đây cho tiện nhé 🙌",
      ],
      ["ha", "Một khởi đầu mới, nhiều ý tưởng mới. Let’s make it happen! 🚀"],
    ];
    db.messages = texts.map(([userId, text], i) => ({
      id: randomUUID(),
      channelId: "general",
      userId,
      text,
      createdAt: new Date(Date.now() - (4 - i) * 180000).toISOString(),
      reactions: {},
      parentId: null,
      attachment: null,
    }));
  }
  // Migrate existing demo data without replacing users or conversations.
  for (const user of db.users)
    user.role ??= user.id === "minh" ? "owner" : "member";
  if (!db.users.some((user) => user.role === "owner") && db.users[0])
    db.users[0].role = "owner";
  for (const channel of db.channels) {
    channel.ownerId ??= channel.members[0];
    channel.managers ??= [];
  }
  const save = () => {
    dirty = true;
    if (file) {
      writeFileSync(file + ".tmp", JSON.stringify(db, null, 2));
      renameSync(file + ".tmp", file);
    }
  };
  if (file) save();
  dirty = false;
  const safe = (u) => {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      initials: u.initials,
      color: u.color,
      role: u.role,
    };
  };
  const token = (req) =>
    req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("session="))
      ?.slice(8);
  const userFor = (req) => {
    const s = db.sessions.find(
      (s) => s.token === token(req) && s.expires > Date.now(),
    );
    return db.users.find((u) => u.id === s?.userId);
  };
  const access = (id, u) =>
    db.channels.find((c) => c.id === id && c.members.includes(u.id));
  const io = options.apiOnly
    ? {
        emit() {},
        use() {},
        on() {},
        sockets: { sockets: new Map() },
      }
    : new Server(server, { maxHttpBufferSize: 1e6 });
  const changed = () => {
    save();
    io.emit("refresh");
  };
  io.use((socket, next) => {
    const u = userFor(socket.request);
    if (!u) return next(new Error("Unauthorized"));
    socket.data.user = u;
    next();
  });
  const presence = () =>
    io.emit("presence", [
      ...new Set([...io.sockets.sockets.values()].map((s) => s.data.user.id)),
    ]);
  io.on("connection", (socket) => {
    const u = socket.data.user;
    socket.join(`user:${u.id}`);
    presence();
    socket.on("disconnect", presence);
    socket.on("typing", (id) => {
      if (access(id, u))
        for (const member of access(id, u).members)
          if (member !== u.id)
            io.to(`user:${member}`).emit("typing", {
              channelId: id,
              name: u.name,
            });
    });
    socket.on("signal", ({ to, channelId, signal } = {}) => {
      const c = access(channelId, u);
      if (
        c?.kind === "dm" &&
        c.members.includes(to) &&
        JSON.stringify(signal || {}).length < 100000
      )
        io.to(`user:${to}`).emit("signal", { from: u.id, channelId, signal });
    });
  });
  const respond = (res, status, data, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end(JSON.stringify(data));
  };
  const fail = (message, status = 400) => {
    throw Object.assign(new Error(message), { status });
  };
  async function handler(req, res) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;
    try {
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        fail("Origin không hợp lệ", 403);
      let body = {};
      if (["POST", "PATCH", "DELETE"].includes(req.method)) {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 8 * 1024 * 1024)
            fail("Dung lượng tối đa 5MB", 413);
        }
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          fail("JSON không hợp lệ");
        }
      }
      const path = url.pathname;
      const method = req.method;
      if (path === "/api/auth" && method === "POST") {
        const email = String(body.email || "")
            .trim()
            .toLowerCase(),
          pass = String(body.password || "");
        if (
          !/^\S+@\S+\.\S+$/.test(email) ||
          pass.length < 8 ||
          pass.length > 128
        )
          fail("Email hợp lệ và mật khẩu ít nhất 8 ký tự");
        let u = db.users.find((u) => u.email === email);
        if (body.register) {
          if (u) fail("Email đã được sử dụng", 409);
          const name = String(body.name || "")
            .trim()
            .slice(0, 60);
          if (!name) fail("Vui lòng nhập tên");
          u = {
            id: randomUUID(),
            name,
            email,
            password: password(pass),
            initials: name
              .split(" ")
              .slice(-2)
              .map((x) => x[0])
              .join("")
              .toUpperCase(),
            color: "#839a79",
            role: "member",
          };
          db.users.push(u);
          db.channels
            .filter((c) => c.kind === "channel")
            .forEach((c) => c.members.push(u.id));
        } else if (!u || !verify(pass, u.password))
          fail("Email hoặc mật khẩu không đúng", 401);
        const session = {
          token: randomBytes(32).toString("hex"),
          userId: u.id,
          expires: Date.now() + 7 * 86400000,
        };
        db.sessions = db.sessions.filter((s) => s.expires > Date.now());
        db.sessions.push(session);
        changed();
        respond(
          res,
          200,
          { user: safe(u) },
          {
            "Set-Cookie": `session=${session.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === "true" || process.env.VERCEL === "1" ? "; Secure" : ""}`,
          },
        );
        return true;
      }
      const u = userFor(req);
      if (!u) fail("Vui lòng đăng nhập", 401);
      if (path === "/api/logout" && method === "POST") {
        db.sessions = db.sessions.filter((s) => s.token !== token(req));
        for (const s of io.sockets.sockets.values())
          if (token(s.request) === token(req)) s.disconnect(true);
        save();
        respond(
          res,
          200,
          { ok: true },
          {
            "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
          },
        );
        return true;
      }
      if (path === "/api/workspace" && method === "GET") {
        const channels = db.channels.filter((c) => c.members.includes(u.id));
        respond(res, 200, {
          transport: options.apiOnly ? "polling" : "socket",
          maxImageBytes: options.apiOnly ? 2 * 1024 * 1024 : 5 * 1024 * 1024,
          user: safe(u),
          users: db.users.map(safe),
          channels,
          messages: db.messages.filter((m) =>
            channels.some((c) => c.id === m.channelId),
          ),
        });
        return true;
      }
      if (path === "/api/channels" && method === "POST") {
        const kind = ["channel", "group", "dm"].includes(body.kind)
          ? body.kind
          : "channel";
        let members =
          kind === "channel"
            ? db.users.map((u) => u.id)
            : [
                ...new Set([
                  u.id,
                  ...(Array.isArray(body.members) ? body.members : []),
                ]),
              ];
        if (members.some((id) => !db.users.some((u) => u.id === id)))
          fail("Thành viên không hợp lệ");
        if (kind === "group" && members.length < 2)
          fail("Chọn ít nhất một đồng đội vào nhóm");
        if (kind === "dm" && members.length !== 2)
          fail("Chọn một người để nhắn riêng");
        let c =
          kind === "dm" &&
          db.channels.find(
            (c) =>
              c.kind === "dm" &&
              c.members.length === 2 &&
              members.every((id) => c.members.includes(id)),
          );
        if (!c) {
          const name = String(body.name || "")
            .trim()
            .slice(0, 60);
          if (!name) fail("Vui lòng nhập tên");
          if (
            db.channels.some(
              (c) =>
                c.kind === "channel" && kind === "channel" && c.name === name,
            )
          )
            fail("Tên kênh đã tồn tại", 409);
          c = {
            id: randomUUID(),
            name,
            kind,
            description: String(body.description || "").slice(0, 240),
            members,
            ownerId: u.id,
            managers: [],
          };
          db.channels.push(c);
          changed();
        }
        respond(res, 201, c);
        return true;
      }
      if (path.startsWith("/api/users/") && method === "PATCH") {
        if (u.role !== "owner")
          fail("Chỉ Owner được thay đổi role workspace", 403);
        const target = db.users.find(
          (person) => person.id === path.split("/")[3],
        );
        if (!target) fail("Không tìm thấy thành viên", 404);
        if (target.role === "owner")
          fail("Không thể thay đổi Owner bằng thao tác này", 403);
        if (!["admin", "member"].includes(body.role)) fail("Role không hợp lệ");
        target.role = body.role;
        changed();
        respond(res, 200, safe(target));
        return true;
      }
      if (
        /^\/api\/channels\/[^/]+\/members$/.test(path) &&
        method === "PATCH"
      ) {
        const c = access(path.split("/")[3], u);
        if (!c) fail("Không có quyền truy cập nhóm", 403);
        if (c.kind !== "group")
          fail("Chỉ nhóm riêng có danh sách thành viên tùy chọn");
        const elevated =
          c.ownerId === u.id || ["owner", "admin"].includes(u.role);
        if (!elevated && !c.managers.includes(u.id))
          fail("Bạn không có quyền quản lý nhóm", 403);
        const add = body.add ?? [],
          remove = body.remove ?? [];
        if (
          !Array.isArray(add) ||
          !Array.isArray(remove) ||
          [...add, ...remove].some(
            (id) =>
              typeof id !== "string" ||
              !db.users.some((person) => person.id === id),
          )
        )
          fail("Danh sách thành viên không hợp lệ");
        if (remove.includes(c.ownerId))
          fail("Không thể xóa người tạo nhóm", 403);
        if (!elevated && remove.some((id) => c.managers.includes(id)))
          fail("Chỉ người tạo nhóm hoặc Admin được xóa quản lý", 403);
        const nextMembers = [...new Set([...c.members, ...add])].filter(
          (id) => !remove.includes(id),
        );
        if (nextMembers.length < 2) fail("Nhóm cần ít nhất hai thành viên");
        let managers = c.managers.filter((id) => nextMembers.includes(id));
        if (body.managers !== undefined) {
          if (!elevated)
            fail("Chỉ người tạo nhóm hoặc Admin được phân quyền nhóm", 403);
          if (
            !Array.isArray(body.managers) ||
            body.managers.some(
              (id) => !nextMembers.includes(id) || id === c.ownerId,
            )
          )
            fail("Quản lý phải là thành viên nhóm");
          managers = [...new Set(body.managers)];
        }
        c.members = nextMembers;
        c.managers = managers;
        changed();
        respond(res, 200, c);
        return true;
      }
      if (path === "/api/messages" && method === "POST") {
        if (!access(body.channelId, u)) fail("Không có quyền truy cập", 403);
        const clientMessageId = body.clientMessageId;
        if (clientMessageId !== undefined && (typeof clientMessageId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(clientMessageId))) fail("Mã tin nhắn không hợp lệ");
        const existing = clientMessageId && db.messages.find(m => m.userId === u.id && m.channelId === body.channelId && m.clientMessageId === clientMessageId);
        if (existing) { respond(res, 200, existing); return true; }
        const text = String(body.text || "").trim();
        if (text.length > 5000) fail("Tin nhắn tối đa 5000 ký tự");
        let attachment = null;
        if (body.gifId !== undefined) {
          const gif = BUILTIN_GIFS.find(item => item.id === body.gifId);
          if (!gif || body.attachment) fail('GIF không hợp lệ');
          attachment = {name:gif.name + '.gif',data:gif.url};
        }
        if (body.attachment) {
          const a = body.attachment;
          if (
            typeof a.data !== "string" ||
            !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(
              a.data,
            ) ||
            Buffer.byteLength(a.data) > 7e6
          )
            fail("Chỉ hỗ trợ PNG, JPG, WEBP, GIF tối đa 5MB");
          attachment = {
            name: String(a.name || "image").slice(0, 120),
            data: a.data,
          };
        }
        if (!text && !attachment) fail("Tin nhắn trống");
        if (
          body.parentId &&
          !db.messages.some(
            (m) =>
              m.id === body.parentId &&
              m.channelId === body.channelId &&
              !m.parentId,
          )
        )
          fail("Thread không hợp lệ");
        const m = {
          id: randomUUID(),
          ...(clientMessageId ? {clientMessageId} : {}),
          channelId: body.channelId,
          userId: u.id,
          text,
          attachment,
          parentId: body.parentId || null,
          createdAt: new Date().toISOString(),
          reactions: {},
        };
        db.messages.push(m);
        changed();
        respond(res, 201, m);
        return true;
      }
      if (path.startsWith("/api/messages/") && method === "PATCH") {
        const m = db.messages.find((m) => m.id === path.split("/")[3]);
        if (!m || !access(m.channelId, u)) fail("Không tìm thấy tin nhắn", 404);
        if (body.emoji) {
          if (!EMOJI_GROUPS.some(group => group.items.some(([emoji]) => emoji === body.emoji)))
            fail("Emoji không hợp lệ");
          const list = m.reactions[body.emoji] || [];
          if (body.active !== undefined && typeof body.active !== "boolean") fail("Trạng thái reaction không hợp lệ");
          const active = body.active ?? !list.includes(u.id);
          m.reactions[body.emoji] = active ? [...new Set([...list, u.id])] : list.filter(id => id !== u.id);
        } else {
          if (m.userId !== u.id) fail("Chỉ sửa tin nhắn của bạn", 403);
          if (!String(body.text || "").trim() || body.text.length > 5000)
            fail("Nội dung không hợp lệ");
          m.text = body.text.trim();
          m.edited = true;
        }
        changed();
        respond(res, 200, m);
        return true;
      }
      if (path.startsWith("/api/messages/") && method === "DELETE") {
        const m = db.messages.find((m) => m.id === path.split("/")[3]);
        if (!m || !access(m.channelId, u) || m.userId !== u.id)
          fail("Không có quyền xóa", 403);
        db.messages = db.messages.filter(
          (x) => x.id !== m.id && x.parentId !== m.id,
        );
        changed();
        respond(res, 200, { ok: true });
        return true;
      }
      fail("API không tồn tại", 404);
    } catch (e) {
      respond(res, e.status || 500, {
        error: e.status ? e.message : "Lỗi máy chủ",
      });
    }
    return true;
  }
  return { handler, io, state: db, isDirty: () => dirty, userFor, access };
}
