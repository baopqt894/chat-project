import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as client } from "socket.io-client";
import { backend } from "../server/backend.mjs";
test("authenticated realtime workspace lifecycle and access control", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gather-test-"));
  let api;
  const server = createServer((req, res) => api.handler(req, res));
  api = backend(server, dir);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const request = async (
    path,
    body,
    cookie,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const r = await fetch(base + "/api/" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    assert.equal((await request("workspace")).status, 401);
    assert.equal(
      (
        await request("auth", {
          email: "minh@gather.demo",
          password: "wrongpass",
        })
      ).status,
      401,
    );
    const a = await request("auth", {
        email: "minh@gather.demo",
        password: "Demo12345!",
      }),
      b = await request("auth", {
        email: "linh@gather.demo",
        password: "Demo12345!",
      });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const c = await request("auth", {
      email: "test@gather.demo",
      password: "Testing123!",
      name: "Test member",
      register: true,
    });
    assert.equal(c.status, 200);
    const connect = async (cookie) => {
      const s = client(base, {
        extraHeaders: { cookie },
        transports: ["websocket"],
      });
      sockets.push(s);
      await new Promise((resolve, reject) => {
        s.once("connect", resolve);
        s.once("connect_error", reject);
      });
      return s;
    };
    const sa = await connect(a.cookie),
      sb = await connect(b.cookie);
    const event = (s, name) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Missing " + name)), 3000);
        s.once(name, (data) => {
          clearTimeout(t);
          resolve(data);
        });
      });
    let evt = event(sb, "refresh");
    const msg = await request(
      "messages",
      { channelId: "general", text: "Realtime integration test" },
      a.cookie,
    );
    assert.equal(msg.status, 201);
    await evt;
    assert.equal(
      (await request("workspace", undefined, b.cookie)).data.messages.some(
        (m) => m.id === msg.data.id,
      ),
      true,
    );
    assert.equal(
      (
        await request(
          "messages/" + msg.data.id,
          { text: "Edited" },
          b.cookie,
          "PATCH",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "messages/" + msg.data.id,
          { text: "Edited" },
          a.cookie,
          "PATCH",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "messages/" + msg.data.id,
          { emoji: "👍" },
          b.cookie,
          "PATCH",
        )
      ).data.reactions["👍"].length,
      1,
    );
    assert.equal(
      (
        await request(
          "messages",
          { channelId: "general", text: "Reply", parentId: msg.data.id },
          b.cookie,
        )
      ).status,
      201,
    );
    const group = await request(
      "channels",
      { kind: "group", name: "Private QA", members: ["linh"] },
      a.cookie,
    );
    assert.equal(group.status, 201);
    assert.equal(
      (
        await request(
          "messages",
          { channelId: group.data.id, text: "intrusion" },
          c.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("workspace", undefined, c.cookie)).data.channels.some(
        (x) => x.id === group.data.id,
      ),
      false,
    );
    const dm = await request(
      "channels",
      { kind: "dm", name: "DM", members: ["linh"] },
      a.cookie,
    );
    assert.equal(dm.status, 201);
    const again = await request(
      "channels",
      { kind: "dm", name: "DM", members: ["minh"] },
      b.cookie,
    );
    assert.equal(again.data.id, dm.data.id);
    evt = event(sb, "signal");
    sa.emit("signal", {
      to: "linh",
      channelId: dm.data.id,
      signal: { type: "invite", video: true },
    });
    assert.equal((await evt).from, "minh");
    evt = event(sa, "signal");
    sb.emit("signal", {
      to: "minh",
      channelId: dm.data.id,
      signal: { type: "accept" },
    });
    assert.equal((await evt).signal.type, "accept");
    evt = event(sb, "typing");
    sa.emit("typing", "general");
    assert.equal((await evt).channelId, "general");
    const image =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1cAAAAASUVORK5CYII=";
    assert.equal(
      (
        await request(
          "messages",
          {
            channelId: "general",
            attachment: { name: "test.png", data: image },
          },
          a.cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          "messages",
          {
            channelId: "general",
            attachment: {
              name: "bad.svg",
              data: "data:image/svg+xml;base64,PHN2Zz4=",
            },
          },
          a.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request("messages", { channelId: "general", text: "" }, a.cookie))
        .status,
      400,
    );
    assert.equal(
      (await request("messages/" + msg.data.id, {}, a.cookie, "DELETE")).status,
      200,
    );
    assert.equal(
      (await request("workspace", undefined, a.cookie)).data.messages.some(
        (m) => m.parentId === msg.data.id,
      ),
      false,
    );
    // Workspace roles and membership mutations are enforced by the backend.
    assert.equal((await request('workspace', undefined, a.cookie)).data.user.role, 'owner');
    assert.equal((await request('users/linh', {role:'admin'}, b.cookie, 'PATCH')).status,403);
    assert.equal((await request('users/minh', {role:'member'}, a.cookie, 'PATCH')).status,403);
    assert.equal((await request('users/linh', {role:'invalid'}, a.cookie, 'PATCH')).status,400);
    assert.equal((await request('users/linh', {role:'admin'}, a.cookie, 'PATCH')).status,200);
    const endpoint = `channels/${group.data.id}/members`;
    assert.equal((await request(endpoint,{add:['khoa','ha']},b.cookie,'PATCH')).status,200);
    assert.equal((await request(endpoint,{add:[c.data.user.id]},c.cookie,'PATCH')).status,403);
    assert.equal((await request(endpoint,{remove:['minh']},a.cookie,'PATCH')).status,403);
    assert.equal((await request(endpoint,{add:['not-a-user']},a.cookie,'PATCH')).status,400);
    assert.equal((await request(endpoint,{managers:['khoa']},a.cookie,'PATCH')).status,200);
    assert.equal((await request('users/linh',{role:'member'},a.cookie,'PATCH')).status,200);
    assert.equal((await request(endpoint,{add:[c.data.user.id]},b.cookie,'PATCH')).status,403);
    const k = await request('auth',{email:'khoa@gather.demo',password:'Demo12345!'});
    assert.equal((await request(endpoint,{add:[c.data.user.id]},k.cookie,'PATCH')).status,200);
    assert.equal((await request(endpoint,{managers:['ha']},k.cookie,'PATCH')).status,403);
    assert.equal((await request(endpoint,{remove:[c.data.user.id]},k.cookie,'PATCH')).status,200);
    assert.equal((await request('messages',{channelId:group.data.id,text:'removed user'},c.cookie)).status,403);
    assert.equal((await request('workspace',undefined,c.cookie)).data.channels.some(x=>x.id===group.data.id),false);
    assert.equal((await request(`channels/${dm.data.id}/members`,{add:['ha']},a.cookie,'PATCH')).status,400);
    assert.equal((await request('channels',{kind:'group',name:'Empty',members:[]},a.cookie)).status,400);
    assert.equal((await request("logout", {}, a.cookie)).status, 200);
    assert.equal((await request("workspace", undefined, a.cookie)).status, 401);
    const persisted = JSON.parse(
      (await import("node:fs")).readFileSync(
        join(dir, "workspace.json"),
        "utf8",
      ),
    );
    assert.ok(persisted.channels.some((x) => x.id === group.data.id));
    assert.ok(persisted.users.every((u) => !u.password.includes("Demo12345!")));
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise((r) => api.io.close(r));
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
