const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { z } = require("zod");

const PORT = Number(process.env.PORT || 4010);
const FIGMA_TOKEN = process.env.FIGMA_TOKEN || "";
const FIGMA_API_BASE = process.env.FIGMA_API_BASE || "https://api.figma.com";

const CACHE_TTL_MS = Number(process.env.FIGMA_CACHE_TTL_MS || 300000);
const MAX_CACHE_ENTRIES = Number(process.env.FIGMA_CACHE_MAX || 50);

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
    inputSchema: z.object({
      fileKey: z.string().min(1),
      depth: z.number().int().min(1).max(6).optional()
    })
  },

  "figma.getNodes": {
    description: "Fetch specific Figma nodes JSON by fileKey and node ids",
    inputSchema: z.object({
      fileKey: z.string().min(1),
      ids: z.array(z.string().min(1)).min(1),
      depth: z.number().int().min(1).max(6).optional()
    })
  }

  ,
  "figma.getImages": {
    description: "Fetch rendered image URLs for specific node ids (Figma Images API)",
    inputSchema: z.object({
      fileKey: z.string().min(1),
      ids: z.array(z.string().min(1)).min(1),
      format: z.enum(["png", "jpg", "svg"]).optional(),
      scale: z.number().min(0.1).max(4).optional()
    })
  }
};

const inflight = new Map();
const cache = new Map();

function now() {
  return Date.now();
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: now() + ttlMs });

  if (cache.size > MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

function pickRateLimitHeaders(headers) {
  const out = {};
  const allowList = [
    "retry-after",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "x-request-id"
  ];

  for (const k of allowList) {
    const v = headers?.[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

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
      const depth = args.depth ?? 3;
      const key = `figma.getFile:fileKey=${args.fileKey}:depth=${depth}`;

      const cached = cacheGet(key);
      if (cached) {
        return res.json({ ok: true, result: cached, meta: { cached: true } });
      }

      if (inflight.has(key)) {
        try {
          const shared = await inflight.get(key);
          return res.json({ ok: true, result: shared, meta: { shared: true } });
        } catch (e) {
          throw e;
        }
      }

      const p = (async () => {
        const r = await client.get(`/v1/files/${args.fileKey}?depth=${depth}`);
        cacheSet(key, r.data, CACHE_TTL_MS);
        return r.data;
      })();

      inflight.set(key, p);

      try {
        const data = await p;
        return res.json({ ok: true, result: data, meta: { cached: false } });
      } finally {
        inflight.delete(key);
      }
    }

    if (name === "figma.getNodes") {
      const depth = args.depth ?? 3;
      const idsJoined = args.ids.join(",");
      const key = `figma.getNodes:fileKey=${args.fileKey}:ids=${idsJoined}:depth=${depth}`;

      const cached = cacheGet(key);
      if (cached) {
        return res.json({ ok: true, result: cached, meta: { cached: true } });
      }

      if (inflight.has(key)) {
        try {
          const shared = await inflight.get(key);
          return res.json({ ok: true, result: shared, meta: { shared: true } });
        } catch (e) {
          throw e;
        }
      }

      const p = (async () => {
        const r = await client.get(`/v1/files/${args.fileKey}/nodes`, {
          params: { ids: idsJoined, depth }
        });
        cacheSet(key, r.data, CACHE_TTL_MS);
        return r.data;
      })();

      inflight.set(key, p);

      try {
        const data = await p;
        return res.json({ ok: true, result: data, meta: { cached: false } });
      } finally {
        inflight.delete(key);
      }
    }

    if (name === "figma.getImages") {
      const idsJoined = args.ids.join(",");
      const format = String(args.format || "png");
      const scale = args.scale ?? 2;
      const key = `figma.getImages:fileKey=${args.fileKey}:ids=${idsJoined}:format=${format}:scale=${scale}`;

      const cached = cacheGet(key);
      if (cached) {
        return res.json({ ok: true, result: cached, meta: { cached: true } });
      }

      if (inflight.has(key)) {
        const shared = await inflight.get(key);
        return res.json({ ok: true, result: shared, meta: { shared: true } });
      }

      const p = (async () => {
        const r = await client.get(`/v1/images/${args.fileKey}`, {
          params: { ids: idsJoined, format, scale }
        });
        cacheSet(key, r.data, CACHE_TTL_MS);
        return r.data;
      })();

      inflight.set(key, p);
      try {
        const data = await p;
        return res.json({ ok: true, result: data, meta: { cached: false } });
      } finally {
        inflight.delete(key);
      }
    }

    return res.status(500).json({ ok: false, error: "Not implemented" });
  } catch (e) {
    const ax = e;
    const status = ax?.response?.status;
    const headers = ax?.response?.headers;

    if (status) {
      const picked = pickRateLimitHeaders(headers);
      for (const [k, v] of Object.entries(picked)) {
        res.setHeader(k, String(v));
      }

      const msg =
        ax?.response?.data?.err ||
        ax?.response?.data?.message ||
        ax?.message ||
        "Tool invocation failed";

      return res.status(status).json({
        ok: false,
        error: msg,
        status
      });
    }

    return res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});

app.listen(PORT, () => console.log(`[toolserver] :${PORT}`));
