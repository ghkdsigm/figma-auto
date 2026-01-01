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
    timeout: 30000,
  });
}

const tools = {
  "figma.getFile": {
    description: "Fetch Figma file JSON by fileKey",
    inputSchema: z.object({
      fileKey: z.string().min(1),
      depth: z.number().int().min(1).max(6).optional(),
    }),
  },
};

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/tools", (_req, res) => res.json({ ok: true, tools: Object.keys(tools) }));

const cache = new Map();
const inflight = new Map();
const CACHE_TTL_MS = Number(process.env.FIGMA_CACHE_TTL_MS || 60_000);

function cacheKey(fileKey, depth) {
  return `${fileKey}::${depth || ""}`;
}

function setRetryHeaders(res, headers) {
  const retryAfter = headers?.["retry-after"];
  if (retryAfter) res.set("Retry-After", String(retryAfter));

  const rateLimitReset = headers?.["x-ratelimit-reset"];
  if (rateLimitReset) res.set("X-RateLimit-Reset", String(rateLimitReset));

  const rateLimitRemaining = headers?.["x-ratelimit-remaining"];
  if (rateLimitRemaining) res.set("X-RateLimit-Remaining", String(rateLimitRemaining));
}

app.post("/tools/:name/invoke", async (req, res) => {
  const name = req.params.name;
  const def = tools[name];
  if (!def) return res.status(404).json({ ok: false, error: "Unknown tool" });

  try {
    const args = def.inputSchema.parse(req.body || {});
    const client = figmaClient();

    if (name === "figma.getFile") {
      const key = cacheKey(args.fileKey, args.depth);
      const now = Date.now();

      const cached = cache.get(key);
      if (cached && cached.expiresAt > now) {
        return res.json({ ok: true, result: cached.data, cached: true });
      }

      const existing = inflight.get(key);
      if (existing) {
        const data = await existing;
        return res.json({ ok: true, result: data, deduped: true });
      }

      const p = (async () => {
        const depth = args.depth ? `?depth=${args.depth}` : "";
        const r = await client.get(`/v1/files/${args.fileKey}${depth}`);
        const data = r.data;

        cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
        return data;
      })();

      inflight.set(key, p);

      try {
        const data = await p;
        return res.json({ ok: true, result: data });
      } finally {
        inflight.delete(key);
      }
    }

    return res.status(500).json({ ok: false, error: "Not implemented" });
  } catch (e) {
    if (axios.isAxiosError(e) && e.response) {
      const status = e.response.status || 500;
      setRetryHeaders(res, e.response.headers || {});
      return res.status(status).json({
        ok: false,
        error: e.response.data || e.message || "Upstream error",
      });
    }

    const msg = e?.message || String(e);
    return res.status(400).json({ ok: false, error: msg });
  }
});

app.listen(PORT, () => console.log(`[toolserver] :${PORT}`));
