import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import archiver = require("archiver");
import { v4 as uuid } from "uuid";
import type { DSRoot, DSNode } from "../ds-mapping/spec";
import axios from "axios";
import { McpClient } from "../mcp/mcp.client";

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escText(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toKebab(s: string) {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function renderProps(props: Record<string, any> | undefined) {
  if (!props) return "";
  const out: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    const attr = toKebab(k);
    if (v === undefined || v === null) continue;
    if (typeof v === "string") out.push(`${attr}="${escapeAttr(v)}"`);
    else if (typeof v === "number" || typeof v === "boolean") out.push(`:${attr}="${String(v)}"`);
    else out.push(`:${attr}='${escapeAttr(JSON.stringify(v))}'`);
  }
  return out.length ? " " + out.join(" ") : "";
}

function renderClasses(classes?: string[]) {
  const list = (classes || []).filter(Boolean);
  if (!list.length) return "";
  return ` class="${escapeAttr(list.join(" "))}"`;
}

function renderNode(n: DSNode): string {
  const tag = n.kind === "component" ? n.name : n.name;
  const props = renderProps(n.props);
  const cls = renderClasses(n.classes);

  if (n.kind === "element" && n.props && typeof (n.props as any).text === "string" && (!n.children || !n.children.length)) {
    const text = String((n.props as any).text);
    const restProps = { ...(n.props || {}) } as any;
    delete restProps.text;
    const p = renderProps(restProps);
    return `<${tag}${cls}${p}>${escText(text)}</${tag}>`;
  }

  if (tag === "img") {
    return `<img${cls}${props} />`;
  }

  if (tag === "BaseButton") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete restProps.label;
    const p = renderProps(restProps);
    return `<BaseButton${cls}${p}>${escText(label)}</BaseButton>`;
  }

  if (tag === "Typography") {
    const text = String(n.props?.text ?? "");
    const restProps = { ...(n.props || {}) };
    delete restProps.text;
    const p = renderProps(restProps);
    return `<Typography${cls}${p}>${escText(text)}</Typography>`;
  }

  if (tag === "BaseInput") {
    return `<BaseInput${cls}${props} />`;
  }

  const children = (n.children || []).map(renderNode).join("\n");
  return `<${tag}${cls}${props}>${children ? "\n" + children + "\n" : ""}</${tag}>`;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(p: string, content: string) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, "utf-8");
}

function nuxtFiles(appHtml: string, dsRoot: DSRoot) {
  const diagnosticsJson = JSON.stringify(dsRoot.diagnostics || [], null, 2);
  const isRaw = dsRoot?.meta?.policy === "RAW";

  const appVue = isRaw
    ? `<template>
  <GeneratedScreen />
</template>
`
    : `<template>
  <div class="min-h-screen bg-white text-slate-900">
    <main class="max-w-4xl mx-auto p-6">
      <GeneratedScreen />
      <details class="mt-10">
        <summary class="cursor-pointer text-sm text-slate-600">Mapping diagnostics</summary>
        <pre class="mt-3 text-xs whitespace-pre-wrap text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-4">{{ diagnostics }}</pre>
      </details>
    </main>
  </div>
</template>

<script setup lang="ts">
import diagnostics from "~/generated/diagnostics.json";
</script>
`;

  const generatedScreenVue = `<template>
  ${appHtml}
</template>
`;

  return {
    "package.json": JSON.stringify(
      {
        name: "a2ui-generated-app",
        private: true,
        type: "module",
        scripts: {
          dev: "nuxt dev",
          build: "nuxt build",
          generate: "nuxt generate",
          preview: "nuxt preview"
        },
        dependencies: {
          nuxt: "^3.11.1"
        },
        devDependencies: {
          tailwindcss: "^3.4.0",
          postcss: "^8.4.0",
          autoprefixer: "^10.4.0"
        }
      },
      null,
      2
    ),
    "nuxt.config.ts": `export default defineNuxtConfig({
  css: ["~/assets/tailwind.css"],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {}
    }
  }
});
`,
    "tailwind.config.js": `export default {
  content: ["./app.vue", "./components/**/*.{vue,js,ts}", "./pages/**/*.vue"],
  theme: { extend: {} },
  plugins: []
};
`,
    "postcss.config.js": `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
`,
    "assets/tailwind.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

:root{
  --ds-primary: #2563eb;
  --ds-danger: #dc2626;
  --ds-fg: #0f172a;
  --ds-muted: #475569;
  --ds-surface: #ffffff;
  --ds-border: #e2e8f0;
}
`,
    "app.vue": appVue,
    "components/GeneratedScreen.vue": generatedScreenVue,
    "generated/diagnostics.json": diagnosticsJson
  };
}

function viteFiles(appHtml: string, dsRoot: DSRoot) {
  const diagnosticsJson = JSON.stringify(dsRoot.diagnostics || [], null, 2);
  const isRaw = dsRoot?.meta?.policy === "RAW";

  const appVue = isRaw
    ? `<template>
  ${appHtml}
</template>
`
    : `<template>
  <div class="min-h-screen bg-white text-slate-900">
    <main class="max-w-4xl mx-auto p-6">
      ${appHtml}
      <details class="mt-10">
        <summary class="cursor-pointer text-sm text-slate-600">Mapping diagnostics</summary>
        <pre class="mt-3 text-xs whitespace-pre-wrap text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-4">{{ diagnostics }}</pre>
      </details>
    </main>
  </div>
</template>

<script setup lang="ts">
import diagnostics from "./generated/diagnostics.json";
</script>
`;

  return {
    "package.json": JSON.stringify(
      {
        name: "a2ui-vue-app",
        private: true,
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview"
        },
        dependencies: {
          vue: "^3.4.0"
        },
        devDependencies: {
          "@vitejs/plugin-vue": "^5.2.0",
          vite: "^5.4.0",
          typescript: "^5.6.2",
          tailwindcss: "^3.4.0",
          postcss: "^8.4.0",
          autoprefixer: "^10.4.0"
        }
      },
      null,
      2
    ),
    "vite.config.ts": `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()]
});
`,
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>a2ui</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    "tailwind.config.js": `export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts}"],
  theme: { extend: {} },
  plugins: []
};
`,
    "postcss.config.js": `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
`,
    "src/styles/tailwind.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

:root{
  --ds-primary: #2563eb;
  --ds-danger: #dc2626;
  --ds-fg: #0f172a;
  --ds-muted: #475569;
  --ds-surface: #ffffff;
  --ds-border: #e2e8f0;
}
`,
    "src/main.ts": `import { createApp } from "vue";
import App from "./App.vue";
import "./styles/tailwind.css";

createApp(App).mount("#app");
`,
    "src/App.vue": appVue,
    "public/assets/.gitkeep": "",
    "src/generated/diagnostics.json": diagnosticsJson
  };
}
@Injectable()
export class CodegenService {
  private outDir: string;

  constructor(private readonly mcp: McpClient) {
    this.outDir = path.join(process.cwd(), ".out");
    ensureDir(this.outDir);
  }

  private collectImageNodeIds(node: DSNode, out: Set<string>) {
    if (!node) return;
    if (node.kind === "element" && node.name === "img") {
      const id = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
      if (id) out.add(id);
    }
    for (const c of node.children || []) this.collectImageNodeIds(c, out);
  }

  private async resolveFigmaAssets(dsRoot: DSRoot, projectDir: string) {
    const fileKey = dsRoot?.meta?.fileKey;
    if (!fileKey) return;

    const ids = new Set<string>();
    this.collectImageNodeIds(dsRoot.tree, ids);
    if (ids.size === 0) return;

    const assetRelDir = "public/assets/figma";
    const assetAbsDir = path.join(projectDir, assetRelDir);
    ensureDir(assetAbsDir);

    const idList = Array.from(ids);
    const chunks: string[][] = [];
    for (let i = 0; i < idList.length; i += 50) chunks.push(idList.slice(i, i + 50));

    const idToUrl = new Map<string, string>();
    for (const chunk of chunks) {
      const r: any = await this.mcp.invokeTool("figma.getImages", {
        fileKey,
        ids: chunk,
        format: "png",
        scale: 2
      });
      const images = r?.images || {};
      for (const [k, v] of Object.entries(images)) {
        if (typeof v === "string" && v) idToUrl.set(k, v);
      }
    }

    for (const [nodeId, url] of idToUrl.entries()) {
      try {
        const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 45000 });
        const safe = nodeId.replace(/[^a-zA-Z0-9._-]/g, "_");
        fs.writeFileSync(path.join(assetAbsDir, `${safe}.png`), Buffer.from(resp.data));
      } catch {
        // ignore single asset failures
      }
    }

    // mutate dsRoot in-place: replace placeholder src with local assets path
    const rewrite = (node: DSNode) => {
      if (!node) return;
      if (node.kind === "element" && node.name === "img") {
        const nodeId = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
        const safe = nodeId.replace(/[^a-zA-Z0-9._-]/g, "_");
        const p = node.props || {};
        const src = String(p.src || "");
        if (!src || src.startsWith("__FIGMA_NODE__")) {
          node.props = { ...p, src: `/assets/figma/${safe}.png` };
        }
      }
      for (const c of node.children || []) rewrite(c);
    };
    rewrite(dsRoot.tree);
  }

  async generateZip(projectId: string, target: string, dsRoot: DSRoot): Promise<string> {
    const id = uuid().slice(0, 8);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `a2ui-${projectId}-${id}-`));

    // Prefer visual fidelity over placeholder nodes by exporting Figma-rendered rasters for image/vector nodes.
    await this.resolveFigmaAssets(dsRoot, dir);

    const screen = renderNode(dsRoot.tree);
    const t = String(target || "nuxt").toLowerCase();
    const files = t === "vue" ? viteFiles(screen, dsRoot) : nuxtFiles(screen, dsRoot);

    for (const [rel, content] of Object.entries(files)) {
      writeFile(path.join(dir, rel), content);
    }

    const zipPath = path.join(this.outDir, `${projectId}-${id}-${target}.zip`);
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", () => resolve(null));
      archive.on("error", reject);
      archive.pipe(output);
      archive.directory(dir, false);
      archive.finalize();
    });

    return zipPath;
  }

  // For UI preview: return the generated SFC source without writing files.
  renderVueSources(dsRoot: DSRoot, target: string) {
    const screen = renderNode(dsRoot.tree);
    const t = String(target || "nuxt").toLowerCase();
    if (t === "vue") {
      return {
        "src/App.vue": viteFiles(screen, dsRoot)["src/App.vue"],
        "src/main.ts": viteFiles(screen, dsRoot)["src/main.ts"]
      };
    }
    return {
      "components/GeneratedScreen.vue": nuxtFiles(screen, dsRoot)["components/GeneratedScreen.vue"],
      "app.vue": nuxtFiles(screen, dsRoot)["app.vue"]
    };
  }
}
