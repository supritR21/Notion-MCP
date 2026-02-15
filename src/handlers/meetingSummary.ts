// src/handlers/meetingSummary.ts
import { Request, Response } from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { validateMeetingSummary } from "../lib/validate";
import { getRun, saveRun, claimLock, releaseLock } from "../lib/idempotency";
import { getStoredToken } from "../auth/oauth";
import { createNotionFromSummary } from "../clients/notionClient";
import { info, error, warn } from "../lib/logger";

const EXPECTED_VERSION = "meetingSummary.v1";

function verifyVersionHeader(req: Request) {
  const ver = req.header("x-mcp-version");
  if (ver !== EXPECTED_VERSION) {
    throw { status: 400, code: "unsupported_version", message: "unsupported or missing x-mcp-version" };
  }
}
function requireIdempotencyKey(req: Request) {
  const k = req.header("x-mcp-idempotency-key");
  if (!k) throw { status: 400, code: "invalid_payload", message: "missing x-mcp-idempotency-key" };
  return k;
}
function verifyHmac(req: Request) {
  const signature = req.header("x-mcp-signature");
  const secret = process.env.MCP_SHARED_SECRET;
  if (!signature) return; // optional if Smart Meet doesn't send
  if (!secret) throw { status: 500, code: "internal_error", message: "server missing MCP_SHARED_SECRET" };
  const raw = JSON.stringify(req.body);
  const hash = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const expected = `sha256=${hash}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw { status: 401, code: "auth_required", message: "invalid signature" };
  }
}

export async function handleMeetingSummary(req: Request, res: Response) {
  const toolRunId = uuidv4();
  info("incoming request", { route: "/handle_meeting_summary", toolRunId, headers: { v: req.header("x-mcp-version") } });

  try {
    verifyVersionHeader(req);
    verifyHmac(req);

    const idempotencyKey = requireIdempotencyKey(req);

    // If previously executed, return previous result (idempotent)
    const previous = await getRun(idempotencyKey);
    if (previous) {
      info("idempotent - returning previous result", { idempotencyKey });
      return res.status(200).json({ status: "ok", toolRunId: previous.toolRunId || toolRunId, externalUrl: previous.externalUrl || "", notes: "idempotent" });
    }

    // Try to claim a lock to avoid concurrent runs
    const locked = await claimLock(idempotencyKey);
    if (!locked) {
      // Another worker is executing; advise partial handling
      return res.status(409).json({ status: "error", code: "in_progress", message: "another run in progress for this idempotency key" });
    }

    // validate payload body
    const payload = validateMeetingSummary(req.body);

    // fetch notion token (workspace connection)
    const tokenData: any = await getStoredToken();
    if (!tokenData || !tokenData.access_token) {
      await releaseLock(idempotencyKey);
      throw { status: 401, code: "auth_required", message: "tool not connected to Notion" };
    }
    const notionToken = tokenData.access_token as string;

    // create page / db entry
    try {
      const parent = process.env.NOTION_PARENT_PAGE_ID!;
      const isDb = (process.env.NOTION_PARENT_IS_DATABASE || "false").toLowerCase() === "true";
      const result = await createNotionFromSummary(notionToken, parent, isDb, payload);

      // save idempotency result
      await saveRun(idempotencyKey, { toolRunId, externalUrl: result.url }, 60 * 60 * 24);

      await releaseLock(idempotencyKey);
      info("success", { idempotencyKey, toolRunId, externalUrl: result.url });
      return res.status(200).json({ status: "ok", toolRunId, externalUrl: result.url });
    } catch (err: any) {
      // handle common permission & rate limit errors from Notion
      await releaseLock(idempotencyKey);
      const status = (err?.status) || 500;
      const message = err?.message || JSON.stringify(err);
      if (err?.message?.includes("rate limit") || err?.status === 429) {
        // partial: retry later by Smart Meet (or orchestrator)
        warn("notion rate limited", { err: message });
        return res.status(429).json({ status: "error", code: "rate_limited", message });
      }
      if (err?.status === 401 || err?.status === 403) {
        // OAuth/permission problems
        error("notion auth/perm issue", { err: message });
        return res.status(401).json({ status: "error", code: "permission_denied", message });
      }
      error("notion create failed", { err: message });
      return res.status(500).json({ status: "error", code: "internal_error", message });
    }
  } catch (err: any) {
    error("handler failed", { err: err?.message || err });
    const status = err?.status || 500;
    const body = { status: "error", code: err?.code || "internal_error", message: err?.message || String(err) };
    return res.status(status).json(body);
  }
}
