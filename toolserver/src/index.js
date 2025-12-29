const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { z } = require("zod");

const PORT = Number(process.env.PORT || 4010);
const FIGMA_TOKEN = process.env.FIGMA_TOKEN || "";
const FIGMA_API_BASE = process.env.FIGMA_API_BASE || "https://api.figma.com";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

function figmaClient() {
  if (!FIGMA_TOKEN) throw new Error("FIGMA_TOKEN is not set");
  return axios.create({
    baseURL: FIGMA_API_BASE,
    headers: { "X-Figma-Token": FIGMA_TOKEN },
    timeout: 30000
  });
}

const tools = {
  "figma.getFile": {
    description: "Fetch Figma file JSON by fileKey",
    inputSchema: z.object({ fileKey: z.string().min(1), depth: z.number().int().min(1).max(6).optional() })
  }
};

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/tools", (_req, res) => res.json({ ok: true, tools: Object.keys(tools) }));
app.post("/tools/:name/invoke", async (req, res) => {
  const name = req.params.name;
  const def = tools[name];
  if (!def) return res.status(404).json({ ok: false, error: "Unknown tool" });

  try {
    const args = def.inputSchema.parse(req.body || {});
    const client = figmaClient();
    if (name === "figma.getFile") {
      const depth = args.depth ? `?depth=${args.depth}` : "";
      const r = await client.get(`/v1/files/${args.fileKey}${depth}`);
      return res.json({ ok: true, result: r.data });
    }
    return res.status(500).json({ ok: false, error: "Not implemented" });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});
app.listen(PORT, () => console.log(`[toolserver] :${PORT}`));
