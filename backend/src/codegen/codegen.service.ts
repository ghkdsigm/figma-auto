import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import os from "os";
import archiver from "archiver";
import { v4 as uuid } from "uuid";
import type { DSRoot, DSNode } from "../ds-mapping/spec";

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
  devtools: { enabled: true },
  css: ["~/assets/tailwind.css"],
  components: [{ path: "~/components", pathPrefix: false }]
})`,
    "tailwind.config.js": `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./components/**/*.{vue,js,ts}", "./pages/**/*.vue", "./app.vue"],
  theme: { extend: {} },
  plugins: []
};`,
    "postcss.config.js": `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };`,
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
    "app.vue": `<template>
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
`,
    "components/GeneratedScreen.vue": `<template>
  ${appHtml}
</template>
`,
    "components/BaseButton.vue": `<template>
  <button
    type="button"
    :class="[
      'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition',
      intentClass,
      sizeClass
    ]"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
const props = defineProps<{ intent?: 'primary' | 'secondary' | 'danger'; size?: 'sm' | 'md' | 'lg' }>();

const intentClass = computed(() => {
  if (props.intent === 'danger') return 'bg-[var(--ds-danger)] text-white';
  if (props.intent === 'secondary') return 'bg-white border border-[var(--ds-border)] text-[var(--ds-fg)]';
  return 'bg-[var(--ds-primary)] text-white';
});

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'px-3 py-1.5 text-xs';
  if (props.size === 'lg') return 'px-5 py-3 text-base';
  return 'px-4 py-2 text-sm';
});
</script>
`,
    "components/Typography.vue": `<template>
  <component :is="tag" :class="className"><slot /></component>
</template>

<script setup lang="ts">
const props = defineProps<{ variant?: 'h1'|'h2'|'h3'|'body'|'caption'; colorToken?: string }>();

const tag = computed(() => {
  if (props.variant === 'h1') return 'h1';
  if (props.variant === 'h2') return 'h2';
  if (props.variant === 'h3') return 'h3';
  return 'p';
});

const className = computed(() => {
  const v = props.variant || 'body';
  const base =
    v === 'h1' ? 'text-3xl font-bold' :
    v === 'h2' ? 'text-2xl font-bold' :
    v === 'h3' ? 'text-xl font-semibold' :
    v === 'caption' ? 'text-xs text-[var(--ds-muted)]' :
    'text-sm text-[var(--ds-fg)]';
  return base;
});
</script>
`,
    "components/BaseInput.vue": `<template>
  <input
    :placeholder="placeholder"
    class="w-full rounded-lg border border-[var(--ds-border)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  />
</template>

<script setup lang="ts">
defineProps<{ placeholder?: string }>();
</script>
`,
    "components/UnsafeBox.vue": `<template>
  <div class="border border-dashed border-amber-300 bg-amber-50/50 rounded-lg p-3">
    <div class="text-xs text-amber-700 mb-2">UnsafeBox: {{ debugName }} ({{ originalType }})</div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ originalType?: string; debugName?: string }>();
</script>
`,
    "generated/diagnostics.json": diagnosticsJson
  };
}

@Injectable()
export class CodegenService {
  private outDir: string;

  constructor() {
    this.outDir = path.join(process.cwd(), ".out");
    ensureDir(this.outDir);
  }

  async generateZip(projectId: string, target: string, dsRoot: DSRoot): Promise<string> {
    const id = uuid().slice(0, 8);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `a2ui-${projectId}-${id}-`));

    const screen = renderNode(dsRoot.tree);
    const files = nuxtFiles(screen, dsRoot);

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
}
