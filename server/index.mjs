import { createServer } from "node:http";
import next from "next";
import { backend } from "./backend.mjs";
const port = Number(process.env.PORT || 3000);
const app = next({
  dev: process.env.NODE_ENV !== "production",
  hostname: "0.0.0.0",
  port,
});
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer(async (req, res) => {
  if (!(await api.handler(req, res))) handle(req, res);
});
const api = backend(server);
server.listen(port, "0.0.0.0", () =>
  console.log(`Gather ready: http://localhost:${port}`),
);
