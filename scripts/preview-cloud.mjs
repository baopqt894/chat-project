// Disposable MongoDB + standard Next server for browser QA of the Vercel path.
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "node:child_process";
const mongo = await MongoMemoryServer.create();
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "-p",
    process.env.QA_PORT || "3002",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      MONGODB_URI: mongo.getUri(),
      MONGODB_DB: "gather_browser_qa",
      COOKIE_SECURE: "false",
    },
  },
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  child.kill("SIGTERM");
  await mongo.stop();
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
child.on("exit", () => void close());
