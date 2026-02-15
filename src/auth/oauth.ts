// src/auth/oauth.ts
import express from "express";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import Redis from "ioredis";
import { info, error } from "../lib/logger";

const router = express.Router();

const TOKENS_FILE = process.env.TOKENS_FILE || "./tokens.json";
const redisUrl = process.env.REDIS_URL;
const redis = redisUrl ? new Redis(redisUrl) : null;

/* ---------------- Dev File Storage ---------------- */

function devReadTokens() {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(TOKENS_FILE), "utf-8"));
  } catch {
    return {};
  }
}

function devWriteTokens(obj: any) {
  fs.writeFileSync(path.resolve(TOKENS_FILE), JSON.stringify(obj, null, 2));
}

/* ===================================================
   STEP 1 — AUTHORIZE
=================================================== */

router.get("/authorize", async (req, res) => {
  const CLIENT_ID = process.env.NOTION_CLIENT_ID;
  const REDIRECT_URI = process.env.NOTION_REDIRECT_URI;

  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).send("OAuth env variables missing");
  }

  const state = uuidv4();

  // Store state for validation (10 minutes)
  if (redis) {
    await redis.set(`oauth:state:${state}`, "1", "EX", 600);
  }

  const url =
    `https://api.notion.com/v1/oauth/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&owner=user` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${state}`;

  info("Redirecting to Notion OAuth", { url });
  res.redirect(url);
});

/* ===================================================
   STEP 2 — CALLBACK
=================================================== */

router.get("/callback", async (req, res) => {
  const CLIENT_ID = process.env.NOTION_CLIENT_ID;
  const CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;
  const REDIRECT_URI = process.env.NOTION_REDIRECT_URI;

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(500).send("OAuth env variables missing");
  }

  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  // Validate state (if Redis enabled)
  if (redis && state) {
    const exists = await redis.get(`oauth:state:${state}`);
    if (!exists) {
      return res.status(400).send("Invalid or expired state");
    }
    await redis.del(`oauth:state:${state}`);
  }

  try {
    const response = await axios.post(
      "https://api.notion.com/v1/oauth/token",
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      },
      {
        auth: {
          username: CLIENT_ID,
          password: CLIENT_SECRET,
        },
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const data = response.data;

    const workspaceId = data.workspace?.id || data.bot_id || uuidv4();

    // Store token securely
    if (redis) {
      await redis.set(
        `tokens:${workspaceId}`,
        JSON.stringify({
          ...data,
          savedAt: new Date().toISOString(),
        })
      );
    } else {
      const tokens = devReadTokens();
      tokens[workspaceId] = data;
      devWriteTokens(tokens);
    }

    info("Notion connected successfully", { workspaceId });

    res.send(
      `✅ Connected Notion workspace: ${workspaceId}. You can close this tab.`
    );
  } catch (err: any) {
    error("OAuth exchange failed", {
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
    });

    res.status(500).send("OAuth failed — check server logs.");
  }
});

/* ===================================================
   HELPER — GET STORED TOKEN
=================================================== */

export async function getStoredToken(workspaceId?: string) {
  if (redis) {
    if (workspaceId) {
      const raw = await redis.get(`tokens:${workspaceId}`);
      return raw ? JSON.parse(raw) : null;
    }

    const keys = await redis.keys("tokens:*");
    if (!keys.length) return null;

    const raw = await redis.get(keys[0] as string);
    return raw ? JSON.parse(raw) : null;
  }

  const tokens = devReadTokens();
  const keys = Object.keys(tokens);
  if (!keys.length) return null;
  return tokens[keys[0]!];
}

export default router;
