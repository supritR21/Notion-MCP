// src/clients/notionClient.ts
import { Client } from "@notionhq/client";
import type { MeetingSummaryV1 } from "../types/mcp";
import { info, warn } from "../lib/logger";

/**
 * Create a Notion page or database row from a MeetingSummaryV1 payload.
 *
 * - token: Notion integration access token
 * - parentId: page_id or database_id depending on parentIsDatabase
 * - parentIsDatabase: if true, create a database row; otherwise create a child page
 */
export async function createNotionFromSummary(
  token: string,
  parentId: string,
  parentIsDatabase: boolean,
  payload: MeetingSummaryV1
) {
  const notion = new Client({ auth: token });
  const meeting = payload.meeting;
  const summary = payload.summary;

  const title = meeting.title || `Meeting ${meeting.id}`;

  const blocks: any[] = [];

  // Heading: Summary (short)
  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [
        {
          type: "text",
          text: { content: "Summary (short)" },
        },
      ],
    },
  });

  // Paragraph with short summary
  blocks.push({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: { content: summary.short },
        },
      ],
    },
  });

  // Detailed heading
  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [
        {
          type: "text",
          text: { content: "Detailed Summary" },
        },
      ],
    },
  });

  // Detailed paragraphs (split if too long)
  const detailed = summary.detailed || "";
  for (const para of splitIntoParagraphs(detailed, 1500)) {
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: { content: para },
          },
        ],
      },
    });
  }

  // Action items as to_do blocks (or you can create DB rows separately)
  if (summary.actionItems && summary.actionItems.length) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: { content: "Action Items" },
          },
        ],
      },
    });

    for (const ai of summary.actionItems) {
      const text = ai.text + (ai.dueDate ? ` (due ${ai.dueDate})` : "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [
            {
              type: "text",
              text: { content: text },
            },
          ],
          checked: false,
        },
      });
    }
  }

  // Highlights
  if (summary.highlights?.length) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: { content: "Highlights" },
          },
        ],
      },
    });

    for (const h of summary.highlights) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: h },
            },
          ],
        },
      });
    }
  }

  // Resources (recording/transcript URLs)
  if (payload.resources?.recordingS3Url || payload.resources?.transcriptS3Url) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: { content: "Resources" },
          },
        ],
      },
    });

    if (payload.resources?.recordingS3Url) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: `Recording: ${payload.resources.recordingS3Url}` },
            },
          ],
        },
      });
    }

    if (payload.resources?.transcriptS3Url) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: `Transcript: ${payload.resources.transcriptS3Url}` },
            },
          ],
        },
      });
    }
  }

  // Create page under parent page OR create database row (and attach blocks)
  if (!parentIsDatabase) {
    // Parent is a page; create a child page with title as property
    const resp = await notion.pages.create({
      parent: { page_id: parentId },
      properties: {
        // Notion's page properties when parent is a page may be ignored,
        // but including a title property is harmless in many setups.
        title: {
          title: [
            {
              type: "text",
              text: { content: title },
            },
          ],
        },
      },
      children: blocks,
    });

    info("notion page created", { id: resp.id, url: (resp as any).url });
    return { url: (resp as any).url, id: resp.id, raw: resp };
  } else {
    // Parent is a database: create a database row with mapped properties.
    // IMPORTANT: adapt property names (Name, MeetingId, MeetingType) to match your DB schema.
    const resp = await notion.pages.create({
      parent: { database_id: parentId },
      properties: {
        Name: {
          title: [
            {
              type: "text",
              text: { content: title },
            },
          ],
        },
        MeetingId: {
          rich_text: [
            {
              type: "text",
              text: { content: meeting.id },
            },
          ],
        },
        MeetingType: {
          rich_text: [
            {
              type: "text",
              text: { content: meeting.type || "" },
            },
          ],
        },
        // add more property mappings here if your DB has other columns
      },
      children: blocks,
    });

    info("notion database row created", { id: resp.id, url: (resp as any).url });
    return { url: (resp as any).url, id: resp.id, raw: resp };
  }
}

function splitIntoParagraphs(text: string, maxLen = 1500) {
  if (!text) return [];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    parts.push(text.slice(start, start + maxLen));
    start += maxLen;
  }
  return parts;
}
