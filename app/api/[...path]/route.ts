import { cloudRequest } from "../../../server/cloud.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
async function handle(request: Request) {
  return cloudRequest(request);
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
