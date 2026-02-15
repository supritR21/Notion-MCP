// src/types/mcp.ts
import { z } from "zod";

export const ActionItem = z.object({
  id: z.string().optional(),
  text: z.string(),
  assignee: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export const Decision = z.object({
  id: z.string().optional(),
  text: z.string().optional(),
  owners: z.array(z.string()).optional(),
});

export const MeetingSummaryV1Schema = z.object({
  version: z.literal("meetingSummary.v1"),
  meeting: z.object({
    id: z.string(),
    title: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    startedAt: z.string(),
    endedAt: z.string(),
    timezone: z.string().optional(),
    participants: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          email: z.string().email().nullable().optional(),
          role: z.string().nullable().optional(),
        })
      )
      .optional(),
  }),
  summary: z.object({
    short: z.string(),
    detailed: z.string(),
    confidence: z.number().min(0).max(1).optional(),
    actionItems: z.array(ActionItem).optional(),
    decisions: z.array(Decision).optional(),
    notes: z.array(z.string()).optional(),
    highlights: z.array(z.string()).optional(),
  }),
  resources: z
    .object({
      transcriptS3Url: z.string().optional(),
      recordingS3Url: z.string().optional(),
      transcriptText: z.string().optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type MeetingSummaryV1 = z.infer<typeof MeetingSummaryV1Schema>;
