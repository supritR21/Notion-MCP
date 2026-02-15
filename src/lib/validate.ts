// src/lib/validate.ts
import { MeetingSummaryV1Schema, type MeetingSummaryV1 } from "../types/mcp";

export function validateMeetingSummary(payload: unknown): MeetingSummaryV1 {
  return MeetingSummaryV1Schema.parse(payload);
}
