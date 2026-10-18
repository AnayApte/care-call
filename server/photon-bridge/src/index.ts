// Photon bridge: the only part of the server that talks to Photon (spectrum-ts is TypeScript only).
//
// Python server -> bridge:  POST http://127.0.0.1:BRIDGE_PORT/send
//   header X-Bridge-Secret, body {to: ["+1..."], text, request_id?, poll_title?}
// Bridge -> Python server:  POST SERVER_URL/api/webhooks/photon
//   header X-Bridge-Secret, body {from, text, request_id?}; the server may answer {reply} to send back.
import { createServer, type IncomingMessage } from "node:http";
import { Spectrum, poll } from "spectrum-ts";
import { imessage } from "@spectrum-ts/imessage";

const BRIDGE_PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const SERVER_URL = process.env.SERVER_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8000}`;
const SECRET = process.env.BRIDGE_SECRET || process.env.DEVICE_TOKEN || "";
const ACK_OPTION = "On my way";
const DECLINE_OPTION = "Can't come";

if (!SECRET) throw new Error("BRIDGE_SECRET (or DEVICE_TOKEN) must be set");

const app = await Spectrum({
  projectId: process.env.PHOTON_PROJECT_ID!,
  projectSecret: process.env.PHOTON_PROJECT_SECRET!,
  providers: [imessage.config()],
});
const im = imessage(app);

// Poll GUID -> request id, so a tap acks the right request. Lost on restart; the
// server then falls back to the newest open request.
const pollRequests = new Map<string, string>();
const dms = new Map<string, Awaited<ReturnType<typeof im.space.create>>>();

async function dmFor(phone: string) {
  let dm = dms.get(phone);
  if (!dm) {
    dm = await im.space.create(await im.user(phone));
    dms.set(phone, dm);
  }
  return dm;
}

async function send(to: string[], text: string, requestId?: string, pollTitle?: string) {
  for (const phone of to) {
    const dm = await dmFor(phone);
    await dm.send(text);
    if (pollTitle) {
      const sent = await dm.send(poll(pollTitle, ACK_OPTION, DECLINE_OPTION));
      if (sent && requestId) pollRequests.set(sent.id, requestId);
    }
  }
}

async function readJson(req: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

// Local HTTP API for the Python server. Bound to 127.0.0.1 only.
createServer(async (req, res) => {
  const reply = (status: number, data: object) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.headers["x-bridge-secret"] !== SECRET) return reply(401, { error: "bad bridge secret" });
    if (req.method === "GET" && req.url === "/health") return reply(200, { ok: true });
    if (req.method !== "POST" || req.url !== "/send") return reply(404, { error: "not found" });
    const { to, text, request_id, poll_title } = await readJson(req);
    if (!Array.isArray(to) || !to.length || typeof text !== "string") return reply(422, { error: "need to[] and text" });
    await send(to, text, request_id, poll_title);
    reply(200, { ok: true });
  } catch (err) {
    console.error("[bridge] send failed", err);
    reply(502, { error: String(err) });
  }
}).listen(BRIDGE_PORT, "127.0.0.1", () => console.log(`[bridge] listening on 127.0.0.1:${BRIDGE_PORT}`));

async function forward(from: string, text: string, requestId?: string): Promise<string | undefined> {
  const res = await fetch(`${SERVER_URL}/api/webhooks/photon`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bridge-Secret": SECRET },
    body: JSON.stringify({ from, text, request_id: requestId ?? null }),
  });
  if (!res.ok) throw new Error(`server answered ${res.status}`);
  return (await res.json()).reply ?? undefined;
}

// Inbound messages and poll taps -> server. One bad message never stops the loop.
for await (const [space, message] of app.messages) {
  try {
    if (message.direction !== "inbound" || !message.sender) continue;
    const c = message.content;
    let answer: string | undefined;
    if (c.type === "text") {
      answer = await forward(message.sender.id, c.text);
    } else if (c.type === "poll_option" && c.selected) {
      const guid = c.pollMessageGuid ?? c.poll.pollMessageGuid;
      answer = await forward(message.sender.id, c.option.title, guid ? pollRequests.get(guid) : undefined);
    }
    if (answer) await space.send(answer);
  } catch (err) {
    console.error("[bridge] inbound failed", err);
  }
}
