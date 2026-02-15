// src/lib/logger.ts
export function info(msg: string, meta: Record<string, any> = {}) {
  console.log(JSON.stringify({ level: "info", msg, ts: new Date().toISOString(), ...meta }));
}
export function warn(msg: string, meta: Record<string, any> = {}) {
  console.warn(JSON.stringify({ level: "warn", msg, ts: new Date().toISOString(), ...meta }));
}
export function error(msg: string, meta: Record<string, any> = {}) {
  console.error(JSON.stringify({ level: "error", msg, ts: new Date().toISOString(), ...meta }));
}
