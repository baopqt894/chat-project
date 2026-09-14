import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { cloudRequest } from "../server/cloud.mjs";

test("Vercel handler reports missing configuration as JSON", async () => {
  const saved = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
  try {
    const r = await cloudRequest(new Request("http://localhost/api/workspace"));
    assert.equal(r.status, 503);
    assert.match(r.headers.get("content-type"), /application\/json/);
    assert.equal((await r.json()).code, "DATABASE_NOT_CONFIGURED");
  } finally {
    if (saved) process.env.MONGODB_URI = saved;
  }
});

test("Mongo persistence, concurrent writes, polling signals and authenticated attachments", async () => {
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri());
  await client.connect();
  const db = client.db("gather_test");
  const req = async (
    path,
    body,
    cookie,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const r = await cloudRequest(
      new Request("http://localhost/api/" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      db,
    );
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    assert.equal((await req("workspace")).status, 401);
    const a = await req("auth", {
        email: "minh@gather.demo",
        password: "Demo12345!",
      }),
      b = await req("auth", {
        email: "linh@gather.demo",
        password: "Demo12345!",
      });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const w = await req("workspace", undefined, a.cookie);
    assert.equal(w.data.transport, "polling");
    assert.equal(w.data.user.role, "owner");
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        req(
          "messages",
          { channelId: "general", text: "Concurrent " + i },
          i % 2 ? a.cookie : b.cookie,
        ),
      ),
    );
    assert.ok(results.every((r) => r.status === 201));
    const after = await req("workspace", undefined, a.cookie);
    assert.equal(
      after.data.messages.filter((m) => m.text.startsWith("Concurrent "))
        .length,
      5,
    );
    const gif = await req('messages',{channelId:'general',gifId:'wave'},a.cookie);
    assert.equal(gif.status,201);assert.equal(gif.data.attachment.data,'/gifs/wave.gif');
    assert.equal((await req('messages',{channelId:'general',gifId:'../../private'},a.cookie)).status,400);
    const group = await req(
      "channels",
      { name: "Private", kind: "group", members: ["linh"] },
      a.cookie,
    );
    const outsider = await req("auth", {
      email: "khoa@gather.demo",
      password: "Demo12345!",
    });
    assert.equal(
      (
        await req(
          "messages",
          { channelId: group.data.id, text: "forbidden" },
          outsider.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await req("users/khoa", { role: "admin" }, b.cookie, "PATCH")).status,
      403,
    );
    assert.equal(
      (await req("users/khoa", { role: "admin" }, a.cookie, "PATCH")).status,
      200,
    );
    assert.equal(
      (
        await req(
          `channels/${group.data.id}/members`,
          { add: ["ha"] },
          outsider.cookie,
          "PATCH",
        )
      ).status,
      403,
    );
    const image =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1cAAAAASUVORK5CYII=";
    const m = await req(
      "messages",
      {
        channelId: group.data.id,
        attachment: { name: "photo.png", data: image },
      },
      a.cookie,
    );
    assert.equal(m.status, 201);
    assert.match(m.data.attachment.data, /^\/api\/attachments\//);
    const download = await cloudRequest(
      new Request("http://localhost" + m.data.attachment.data, {
        headers: { cookie: b.cookie },
      }),
      db,
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "image/png");
    assert.ok((await download.arrayBuffer()).byteLength > 20);
    const forbiddenImage = await cloudRequest(
      new Request("http://localhost" + m.data.attachment.data, {
        headers: { cookie: outsider.cookie },
      }),
      db,
    );
    assert.equal(forbiddenImage.status, 404);
    const doc = await db.collection("workspaces").findOne({ _id: "default" });
    assert.ok(!JSON.stringify(doc).includes(image));
    const dm = await req(
      "channels",
      { kind: "dm", name: "DM", members: ["linh"] },
      a.cookie,
    );
    const first = await req("realtime", { clientId: "browser-b" }, b.cookie);
    assert.equal(first.status, 200);
    assert.ok(first.data.online.includes("linh"));
    assert.equal(
      (
        await req(
          "realtime",
          {
            event: "signal",
            payload: {
              to: "linh",
              channelId: dm.data.id,
              signal: { type: "invite", video: true },
            },
          },
          a.cookie,
        )
      ).status,
      200,
    );
    const poll = await req(
      "realtime",
      { clientId: "browser-b", since: first.data.cursor },
      b.cookie,
    );
    assert.ok(
      poll.data.events.some(
        (e) => e.type === "signal" && e.payload.signal.type === "invite",
      ),
    );
    assert.equal(
      (
        await req(
          "realtime",
          {
            event: "signal",
            payload: {
              to: "linh",
              channelId: dm.data.id,
              signal: { type: "invite" },
            },
          },
          outsider.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "realtime",
          { event: "typing", payload: group.data.id },
          a.cookie,
        )
      ).status,
      200,
    );
    assert.ok(
      (
        await req(
          "realtime",
          { clientId: "browser-b", since: first.data.cursor },
          b.cookie,
        )
      ).data.events.some((e) => e.type === "typing"),
    );
    assert.equal(
      (
        await req(
          `channels/${group.data.id}/members`,
          { remove: ["linh"], add: ["ha"] },
          a.cookie,
          "PATCH",
        )
      ).status,
      200,
    );
    const removed = await cloudRequest(
      new Request("http://localhost" + m.data.attachment.data, {
        headers: { cookie: b.cookie },
      }),
      db,
    );
    assert.equal(removed.status, 404);
    // New database handle still sees persistent sessions/messages; no module memory dependency.
    const fresh = await cloudRequest(
      new Request("http://localhost/api/workspace", {
        headers: { cookie: a.cookie },
      }),
      client.db("gather_test"),
    );
    assert.equal(fresh.status, 200);
    assert.equal(
      (await fresh.json()).messages.filter((m) =>
        m.text.startsWith("Concurrent "),
      ).length,
      5,
    );
    assert.equal((await req("logout", {}, a.cookie)).status, 200);
    assert.equal((await req("workspace", undefined, a.cookie)).status, 401);
    assert.equal(
      (await req("realtime", { clientId: "expired" }, a.cookie)).status,
      401,
    );
    const bad = await cloudRequest(
      new Request("http://localhost/api/auth", {
        method: "POST",
        body: "{bad",
      }),
      db,
    );
    assert.equal(bad.status, 400);
    assert.match(bad.headers.get("content-type"), /json/);
  } finally {
    await client.close();
    await mongo.stop();
  }
});
