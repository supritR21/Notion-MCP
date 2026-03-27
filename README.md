# Notion-MCP

Express + TypeScript MCP bridge that receives SmartMeet-style meeting summaries and writes them into Notion pages or database rows.

## What This Service Does

- Exposes OAuth endpoints to connect a Notion workspace
- Accepts `meetingSummary.v1` payloads over HTTP
- Validates payloads with Zod
- Enforces idempotency via key-based deduplication
- Optionally verifies HMAC signatures
- Creates rich Notion content (summary, details, action items, highlights, resources)

## Tech Stack

- Node.js
- TypeScript
- Express
- Zod
- Notion SDK (`@notionhq/client`)
- Redis (`ioredis`, optional)
- Docker

## Project Structure

```text
Notion-MCP/
	src/
		index.ts                      # App bootstrap + route wiring
		auth/oauth.ts                 # Notion OAuth authorize/callback + token storage
		handlers/meetingSummary.ts    # Main MCP handler
		clients/notionClient.ts       # Notion page/database creation logic
		types/mcp.ts                  # Zod schema for meetingSummary.v1
		lib/
			validate.ts                 # Payload parsing
			idempotency.ts              # Idempotency + locking (Redis/in-memory)
			logger.ts                   # JSON logger
	DockerFile
	package.json
	tsconfig.json
```

## API Endpoints

- `GET /health`
	- Health check endpoint

- `GET /oauth/authorize`
	- Starts Notion OAuth flow

- `GET /oauth/callback`
	- Handles OAuth callback and stores tokens

- `POST /handle_meeting_summary`
	- Main MCP ingestion endpoint

## Required Request Headers for MCP Endpoint

- `x-mcp-version: meetingSummary.v1`
- `x-mcp-idempotency-key: <unique-key>`
- `x-mcp-signature: sha256=<hex>` (optional, required only if `MCP_SHARED_SECRET` is configured and signature is provided)

## Environment Variables

Create a `.env` file in the project root.

```env
# Server
PORT=4000

# Notion OAuth
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=http://localhost:4000/oauth/callback

# Notion target parent
# If true -> parent is a database id; if false -> parent is a page id
NOTION_PARENT_IS_DATABASE=false
NOTION_PARENT_PAGE_ID=

# Optional security
MCP_SHARED_SECRET=

# Optional Redis for token/idempotency/lock persistence
REDIS_URL=

# Dev fallback token storage file (used when REDIS_URL is not set)
TOKENS_FILE=./tokens.json
```

## Local Development

1. Install dependencies

```bash
npm install
```

2. Run in development mode

```bash
npm run dev
```

3. Build and run production mode

```bash
npm run build
npm start
```

Service runs on `http://localhost:4000` by default.

## OAuth Setup Flow

1. Start the server
2. Open:

```text
http://localhost:4000/oauth/authorize
```

3. Authorize your Notion workspace
4. On success, callback stores access token in:
	 - Redis (`REDIS_URL` set), or
	 - local file (`TOKENS_FILE`) for development

## MCP Payload Contract

The service expects body schema `meetingSummary.v1` with:

- `meeting` object (id, time range, optional participants)
- `summary` object (`short`, `detailed`, optional action items/highlights/decisions)
- optional `resources` (recording/transcript URLs)
- optional `metadata`

Minimal valid example:

```json
{
	"version": "meetingSummary.v1",
	"meeting": {
		"id": "mtg-123",
		"startedAt": "2026-03-27T09:00:00Z",
		"endedAt": "2026-03-27T09:30:00Z"
	},
	"summary": {
		"short": "Weekly sync completed",
		"detailed": "Team reviewed roadmap and assigned follow-ups."
	}
}
```

## cURL Example

```bash
curl -X POST http://localhost:4000/handle_meeting_summary \
	-H "Content-Type: application/json" \
	-H "x-mcp-version: meetingSummary.v1" \
	-H "x-mcp-idempotency-key: run-001" \
	-d '{
		"version":"meetingSummary.v1",
		"meeting":{
			"id":"mtg-123",
			"title":"Weekly Product Sync",
			"startedAt":"2026-03-27T09:00:00Z",
			"endedAt":"2026-03-27T09:30:00Z"
		},
		"summary":{
			"short":"Roadmap review completed.",
			"detailed":"Discussed priorities, risks, and next milestones.",
			"actionItems":[{"text":"Prepare release notes","dueDate":"2026-03-30"}],
			"highlights":["Q2 scope locked"]
		}
	}'
```

## Idempotency and Concurrency

- Reusing the same `x-mcp-idempotency-key` returns prior success response
- With Redis enabled, lock keys prevent concurrent duplicate execution
- In-memory fallback is available for development only

## Docker

Build image (note the file is named `DockerFile`):

```bash
docker build -f DockerFile -t notion-mcp .
```

Run container:

```bash
docker run --rm -p 4000:4000 --env-file .env notion-mcp
```

## Notion Database Mode Notes

When `NOTION_PARENT_IS_DATABASE=true`, property names are currently hardcoded in the implementation:

- `Name`
- `MeetingId`
- `MeetingType`

Ensure your Notion database has matching properties or update the mapping logic in code.

## Troubleshooting

- `unsupported or missing x-mcp-version`
	- Set header `x-mcp-version: meetingSummary.v1`

- `missing x-mcp-idempotency-key`
	- Add `x-mcp-idempotency-key` header

- `tool not connected to Notion`
	- Complete OAuth flow using `/oauth/authorize`

- OAuth failed during callback
	- Verify `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, and redirect URI match in Notion app settings

- Permission or 401/403 errors from Notion
	- Share target page/database with the connected Notion integration

## License

ISC
