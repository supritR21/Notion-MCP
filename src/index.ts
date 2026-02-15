// src/index.ts
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import oauthRouter from "./auth/oauth";
import { handleMeetingSummary } from "./handlers/meetingSummary";
import { info } from "./lib/logger";


const app = express();
const PORT = process.env.PORT || 4000;

app.use(bodyParser.json({ limit: "100kb" })); // limit per canonical guidance
app.get("/health", (req, res) => res.json({ status: "ok" }));

// OAuth endpoints to connect Notion workspace
app.use("/oauth", oauthRouter);

// MCP endpoint
app.post("/handle_meeting_summary", handleMeetingSummary);

app.listen(PORT, () => info("smartmeet-mcp-notion listening", { port: PORT }));
