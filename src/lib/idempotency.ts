// src/lib/idempotency.ts
import Redis from "ioredis";
import { info, error } from "./logger";

const redisUrl = process.env.REDIS_URL;
let redis: Redis | null = null;
if (redisUrl) {
  redis = new Redis(redisUrl);
  redis.on("error", (e) => error("redis error", { e: e.message }));
}

const IN_MEMORY = new Map<string, any>();

export async function getRun(idempotencyKey: string) {
  if (redis) {
    const v = await redis.get(`idemp:${idempotencyKey}`);
    return v ? JSON.parse(v) : null;
  } else {
    return IN_MEMORY.get(idempotencyKey) ?? null;
  }
}

export async function saveRun(idempotencyKey: string, value: any, ttlSeconds = 60 * 60 * 24) {
  if (redis) {
    await redis.set(`idemp:${idempotencyKey}`, JSON.stringify(value), "EX", ttlSeconds);
  } else {
    IN_MEMORY.set(idempotencyKey, value);
  }
  info("idempotency saved", { idempotencyKey });
}

export async function claimLock(idempotencyKey: string, lockTTL = 30) {
  if (!redis) return true; // best-effort: in memory we won't lock (dev only)
  const lockKey = `lock:${idempotencyKey}`;
  const acquired = await redis.set(lockKey, "1", "EX", lockTTL, "NX");
  return !!acquired;
}

export async function releaseLock(idempotencyKey: string) {
  if (!redis) return;
  await redis.del(`lock:${idempotencyKey}`);
}
