/* backend/src/codegen/codegen.service.ts */
import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import archiver = require("archiver");
import { v4 as uuid } from "uuid";
import type { DSRoot, DSNode } from "../ds-mapping/spec";
import axios from "axios";
import { McpClient } from "../mcp/mcp.client";

function normalizeLineEndings(s: string): string {
  return String(s || "").replace(/\r\n/g, "\n");
}

function trimRightLines(s: string): string {
  return normalizeLineEndings(s)
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n");
}

// Lightweight, dependency-free indentation for Vue <template> blocks.
// Not a full HTML/Vue formatter, but keeps GeneratedScreen.vue readable and stable.
function indentVueTemplateBlock(templateBlockFull: string, indentSize = 2): string {
  const src = normalizeLineEndings(templateBlockFull);
  const lines = src.split("\n");

  // Find opening <template ...> line and closing </template>
  const openIdx = lines.findIndex((l) => /<template\b/.test(l));
  if (openIdx < 0) return templateBlockFull;
  const closeIdx = (() => {
    for (let i = lines.length - 1; i >= 0; i--) if (/<\/template>/.test(lines[i])) return i;
    return -1;
  })();
  if (closeIdx < 0 || closeIdx <= openIdx) return templateBlockFull;

  const openLine = lines[openIdx].trim();
  const closeLine = lines[closeIdx].trim();

  const inner = lines.slice(openIdx + 1, closeIdx);
  const outInner: string[] = [];

  let level = 0;
  const step = " ".repeat(Math.max(0, indentSize));

  for (const rawLine of inner) {
    const line = rawLine.trim();
    if (!line) {
      outInner.push("");
      continue;
    }

    // De-indent on closing tags first
    const isClosing = /^<\/[A-Za-z]/.test(line) || /^<\/>/.test(line);
    const isElseLike = /^(<\/template>)$/.test(line) || /^<template\b/.test(line);
    if (isClosing && !isElseLike) level = Math.max(0, level - 1);

    outInner.push(step.repeat(level) + line);

    // Increase indent after opening tags (very naive but good enough for generated markup)
    const isSelfClosing = /\/>$/.test(line);
    const isComment = /^<!--/.test(line);
    const isDoctype = /^<!DOCTYPE/i.test(line);
    const opensTag = /^<[A-Za-z]/.test(line) && !isSelfClosing && !isComment && !isDoctype;
    const closesSameLine = /<\/[A-Za-z][\w:-]*>\s*$/.test(line);
    if (opensTag && !closesSameLine) level += 1;
  }

  return [openLine, ...outInner, closeLine].join("\n");
}

function formatVueSfcLight(sfc: string): string {
  const src = trimRightLines(sfc);
  return replaceInTemplateBlocks(src, (tpl) => indentVueTemplateBlock(tpl, 2));
}

function stripMarkdownCodeFences(s: string): string {
  const t = String(s || "").trim();
  if (!t) return "";
  const fenced = t.match(/^```[\w-]*\s*\n([\s\S]*?)\n```$/);
  if (fenced) return String(fenced[1] || "").trim();
  return t;
}

function extractTemplateBlocks(sfc: string): Array<{ full: string; start: number; end: number }> {
  const src = String(sfc || "");
  const blocks: Array<{ full: string; start: number; end: number }> = [];
  const re = /<template\b[\s\S]*?<\/template>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    blocks.push({ full: m[0], start: m.index, end: m.index + m[0].length });
  }
  return blocks;
}

function replaceInTemplateBlocks(sfc: string, replacer: (templateBlockFull: string) => string): string {
  const src = String(sfc || "");
  const blocks = extractTemplateBlocks(src);
  if (!blocks.length) return src;

  let out = "";
  let last = 0;
  for (const b of blocks) {
    out += src.slice(last, b.start);
    out += replacer(b.full);
    last = b.end;
  }
  out += src.slice(last);
  return out;
}

function collectTokens(src: string, re: RegExp): Map<string, number> {
  const m = new Map<string, number>();
  const s = String(src || "");
  const matches = s.match(re) || [];
  for (const t of matches) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function collectTagSequenceFromTemplateBlock(templateBlockFull: string): string[] {
  const s = String(templateBlockFull || "");
  const tags: string[] = [];
  const re = /<\/?([A-Za-z][\w:-]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) tags.push(m[1]);
  return tags;
}

function validateRefinedPackedSfcOrNull(
  originalPackedSfc: string,
  refinedPackedSfc: string,
  classMap: Record<string, string>,
  styleMap: Record<string, string>
): string | null {
  const orig = String(originalPackedSfc || "");
  const ref = String(refinedPackedSfc || "");

  const origBlocks = extractTemplateBlocks(orig);
  const refBlocks = extractTemplateBlocks(ref);
  if (origBlocks.length !== refBlocks.length) return null;

  const allowed = new Set<string>([...Object.keys(classMap || {}), ...Object.keys(styleMap || {})]);

  const clsRe = /__CLS_\d+__/g;
  const styRe = /__STYLE_\d+__/g;

  const origCls = collectTokens(orig, clsRe);
  const refCls = collectTokens(ref, clsRe);
  const origSty = collectTokens(orig, styRe);
  const refSty = collectTokens(ref, styRe);

  const sameMap = (a: Map<string, number>, b: Map<string, number>) => {
    if (a.size !== b.size) return false;
    for (const [k, v] of a.entries()) if (b.get(k) !== v) return false;
    return true;
  };

  if (!sameMap(origCls, refCls)) return null;
  if (!sameMap(origSty, refSty)) return null;

  const refAllTokens = [...(ref.match(clsRe) || []), ...(ref.match(styRe) || [])];
  for (const t of refAllTokens) {
    if (!allowed.has(t)) return null;
  }

  for (let i = 0; i < origBlocks.length; i += 1) {
    const a = collectTagSequenceFromTemplateBlock(origBlocks[i].full);
    const b = collectTagSequenceFromTemplateBlock(refBlocks[i].full);
    if (a.length !== b.length) return null;
    for (let j = 0; j < a.length; j += 1) {
      if (a[j] !== b[j]) return null;
    }
  }

  return ref;
}

function packRepeatedAttrs(vueSource: string): {
  packed: string;
  classMap: Record<string, string>;
  styleMap: Record<string, string>;
} {
  const src = String(vueSource || "");

  const classToToken = new Map<string, string>();
  const styleToToken = new Map<string, string>();
  const classMap: Record<string, string> = {};
  const styleMap: Record<string, string> = {};

  let classIdx = 0;
  let styleIdx = 0;

  const getClassToken = (val: string) => {
    const v = String(val ?? "");
    const prev = classToToken.get(v);
    if (prev) return prev;
    classIdx += 1;
    const tok = `__CLS_${classIdx}__`;
    classToToken.set(v, tok);
    classMap[tok] = v;
    return tok;
  };

  const getStyleToken = (val: string) => {
    const v = String(val ?? "");
    const prev = styleToToken.get(v);
    if (prev) return prev;
    styleIdx += 1;
    const tok = `__STYLE_${styleIdx}__`;
    styleToToken.set(v, tok);
    styleMap[tok] = v;
    return tok;
  };

  const packed = replaceInTemplateBlocks(src, (tpl) => {
    let t = String(tpl || "");

    t = t.replace(/\bclass="([^"]*)"/g, (_m, v) => {
      const vv = String(v ?? "");
      if (!vv.trim()) return `class=""`;
      if (/^__CLS_\d+__$/.test(vv.trim())) return `class="${vv.trim()}"`;
      const tok = getClassToken(vv);
      return `class="${tok}"`;
    });

    t = t.replace(/\bstyle="([^"]*)"/g, (_m, v) => {
      const vv = String(v ?? "");
      if (!vv.trim()) return `style=""`;
      if (/^__STYLE_\d+__$/.test(vv.trim())) return `style="${vv.trim()}"`;
      const tok = getStyleToken(vv);
      return `style="${tok}"`;
    });

    return t;
  });

  return { packed, classMap, styleMap };
}

function unpackAttrs(vueSource: string, classMap: Record<string, string>, styleMap: Record<string, string>): string {
  const src = String(vueSource || "");

  return replaceInTemplateBlocks(src, (tpl) => {
    let out = String(tpl || "");
    for (const [tok, val] of Object.entries(classMap || {})) {
      out = out.split(tok).join(val);
    }
    for (const [tok, val] of Object.entries(styleMap || {})) {
      out = out.split(tok).join(val);
    }
    return out;
  });
}

function buildReadmeMarkdown(target: string) {
  const t = String(target || "nuxt").toLowerCase() === "vue" ? "vue(vite)" : "nuxt";

  return `# A2UI Generated Output

이 ZIP은 A2UI Codegen이 생성한 ${t} 결과물입니다.

---

## Cursor Prompt (그대로 복사해서 사용)

아래 프롬프트를 Cursor에 그대로 붙여넣고 실행하세요.  
대상 코드는 이 ZIP 내부의 소스 전체입니다.

\`\`\`
너는 프론트엔드 시니어 개발자다. 아래 ZIP 프로젝트 소스를 기준으로 코드를 리팩토링/개선해라.

목표:
1) app.vue 및 모든 Vue 파일의 들여쓰기/줄맞춤을 정리한다(가독성 좋은 포맷팅).
2) 디자인(스타일)은 생성된 결과물을 기준으로 유지한다.
   - 특히 가로/세로 사이즈는 생성된 app.vue(또는 화면 루트)에 명시된 width/height 값을 그대로 보존한다.
3) Figma INSTANCE/COMPONENT/그룹 이름/메타를 근거로 치환, 없다면 UI 요소를 components 폴더의 컴포넌트로 치환한다.
   - 버튼/셀렉트/인풋/라디오/캐러셀/플래그/토글/스위치/썸네일카드/드롭다운/얼럿다이얼로그/체크박스/팝업/탭/햄버거/캘린더 등을 우선 대상으로 한다.
   - 치환 후에도 2)에서 말한 추출된 디자인(스타일, spacing, radius, color, typography, width/height)을 동일하게 적용한다.
4) app.vue 및 각 컴포넌트에 반응형을 적용한다.
   - 기본(디자인 기준) 레이아웃은 유지하되, sm/md/lg 등의 breakpoint에서 자연스럽게 확장/축소되도록 Tailwind 기반으로 정리한다.

제약:
- 기능 동작은 유지한다.
- 디자인이 무너지지 않도록 2) 조건(특히 width/height 보존)을 최우선으로 한다.

작업 순서:
A. app.vue 포맷팅
B. components 폴더에 있는 컴포넌트 목록 파악
C. app.vue의 div 블록들을 의미 있는 컴포넌트로 교체
D. 각 컴포넌트에 추출 스타일 이식 및 반응형 처리
E. 빌드/런 기준으로 깨지는 부분 수정

결과:
- 수정된 전체 파일 내용을 반영해라.
\`\`\`

---

## 실행 메모
- Nuxt: \`npm install\` → \`npm run dev\`
- Vue(Vite): \`npm install\` → \`npm run dev\`
`;
}

function buildReadmeRefactorMarkdown() {
  return `UI 변경 금지
// 가능하면 components/의 공통 컴포넌트로 치환(BaseButton/BaseInput/BaseSelect/BaseCheckbox/BaseRadio/BaseSwitch 등)
// 확신 없으면 div 유지
app.vue 및 모든 Vue 파일의 들여쓰기/줄맞춤을 정리한다(가독성 좋은 포맷팅)

그리고 이제부터 app.vue를 바꿔주면돼 UI/레이아웃은 절대 바꾸지 말 것(픽셀/간격/정렬 유지)

manifest.json의 cursorGuidance.preferComponents에 있는 공통 컴포넌트를 임포트해서 최대한 치환해라

div/span 구조를 공통 컴포넌트로만 치환할 것

치환이 애매하면 원래 div 유지하고 TODO 남길 것

치환 시 스타일 처리 규칙
- “치환해도 기존 class/style는 유지(필요하면 wrapper div로 보존)”
- “props로 옮길 수 있는 것만 옮기고, 나머지는 class로 유지”

입력 컴포넌트(BaseInput, BaseSelect, CalendarInput, BaseTextarea 등)를 감싸고 있는 스타일 wrapper div를 모두 제거하고, 그 스타일을 해당 입력 컴포넌트에 통합해줘

App.vue에 script setup을 추가하고, 현재 사용 중인 모든 공통 컴포넌트들을 컴포넌트별 props/이벤트 규칙에 맞게 연결해줘. 입력 컴포넌트는 v-model, 체크/토글은 v-model:checked, 버튼은 이벤트 핸들러로. 기본값은 화면에 보이는 값으로 설정해줘
`;
}

type ManifestPropSummary = {
  types: string[];
  examples?: Array<string | number | boolean | null>;
};

type Manifest = {
  schemaVersion: "0.1";
  generatedAt: string;
  policy: string;
  target: string;
  designSystem?: { name?: string; tokensVersion?: string; pathTried: string[] };
  commonComponents: string[];
  generatedComponents: string[];
  componentPropsSummary: Record<string, Record<string, ManifestPropSummary>>;
  cursorGuidance?: {
    uiChangeForbidden: boolean;
    preferComponents: string[];
    fallbackRule: string;
    note?: string;
  };
  rawCandidatePatterns?: Array<{
    candidate: string;
    confidence: "high" | "medium";
    reason: string;
    exampleTag: string;
    exampleClasses: string[];
    occurrences: number;
  }>;
  hints?: {
    diagnosticsSample?: Array<{
      severity: "info" | "warn" | "error";
      code: string;
      message: string;
      nodeId?: string;
      namePath?: string;
    }>;
  };
};

function safeExample(v: any): string | number | boolean | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string") return v.length > 120 ? v.slice(0, 117) + "..." : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  return undefined;
}

function valueType(v: any): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function loadDesignSystemForManifest(): {
  ds: any | null;
  pathTried: string[];
} {
  const pathTried: string[] = [];
  const candidates = [
    path.join(process.cwd(), "design-system", "design-system.json"),
    path.resolve(__dirname, "../../design-system/design-system.json")
  ];

  for (const p of candidates) {
    try {
      pathTried.push(p);
      const raw = fs.readFileSync(p, "utf-8");
      return { ds: JSON.parse(raw), pathTried };
    } catch {
      // try next
    }
  }
  return { ds: null, pathTried };
}

function collectComponentPropsSummary(dsRoot: DSRoot): Record<string, Record<string, ManifestPropSummary>> {
  const out: Record<
    string,
    Record<string, { typeSet: Set<string>; examples: Array<string | number | boolean | null> }>
  > = {};

  const visit = (n: DSNode | undefined) => {
    if (!n) return;
    if (n.kind === "component") {
      const name = String(n.name || "");
      if (!out[name]) out[name] = {};
      const props = n.props || {};
      for (const [k, v] of Object.entries(props)) {
        if (!out[name][k]) out[name][k] = { typeSet: new Set<string>(), examples: [] };
        out[name][k].typeSet.add(valueType(v));
        const ex = safeExample(v);
        if (ex !== undefined && out[name][k].examples.length < 3) out[name][k].examples.push(ex);
      }
    }
    for (const c of n.children || []) visit(c);
  };

  visit(dsRoot.tree);

  const finalized: Record<string, Record<string, ManifestPropSummary>> = {};
  for (const [comp, props] of Object.entries(out)) {
    finalized[comp] = {};
    for (const [k, v] of Object.entries(props)) {
      finalized[comp][k] = {
        types: Array.from(v.typeSet).sort(),
        ...(v.examples.length ? { examples: v.examples } : {})
      };
    }
  }
  return finalized;
}

function parseDefinePropsSpec(vueSource: string): Record<string, ManifestPropSummary> {
  const m = vueSource.match(/defineProps\s*<\s*\{([\s\S]*?)\}\s*>\s*\(\s*\)\s*;?/);
  if (!m) return {};
  const body = m[1] || "";

  const out: Record<string, ManifestPropSummary> = {};
  const lines = body
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/g, "").trim())
    .filter(Boolean);

  for (const line of lines) {
    const mm = line.match(/^([A-Za-z_]\w*)\s*(\?)?\s*:\s*([^;]+);?$/);
    if (!mm) continue;
    const key = mm[1];
    const type = mm[3].trim();
    out[key] = { types: [type] };
  }

  return out;
}

function collectGeneratedComponentPropsSpec(): Record<string, Record<string, ManifestPropSummary>> {
  const sources = getComponentSources() as Record<string, string>;
  const out: Record<string, Record<string, ManifestPropSummary>> = {};
  for (const [name, src] of Object.entries(sources)) {
    const spec = parseDefinePropsSpec(src);
    if (Object.keys(spec).length) out[name] = spec;
  }
  return out;
}

function mergePropsSummary(
  a: Record<string, Record<string, ManifestPropSummary>>,
  b: Record<string, Record<string, ManifestPropSummary>>
): Record<string, Record<string, ManifestPropSummary>> {
  const out: Record<string, Record<string, ManifestPropSummary>> = { ...a };
  for (const [comp, props] of Object.entries(b)) {
    if (!out[comp]) out[comp] = {};
    for (const [k, v] of Object.entries(props)) {
      if (!out[comp][k]) {
        out[comp][k] = { types: [...(v.types || [])], ...(v.examples ? { examples: [...v.examples] } : {}) };
        continue;
      }
      const prev = out[comp][k];
      const typeSet = new Set([...(prev.types || []), ...(v.types || [])]);
      const ex = [
        ...((prev.examples || []) as Array<string | number | boolean | null>),
        ...((v.examples || []) as Array<string | number | boolean | null>)
      ].slice(0, 3);
      out[comp][k] = { types: Array.from(typeSet).sort(), ...(ex.length ? { examples: ex } : {}) };
    }
  }
  return out;
}

function collectRawCandidatePatterns(dsRoot: DSRoot): Manifest["rawCandidatePatterns"] {
  const policy = dsRoot?.meta?.policy;
  if (policy !== "RAW") return undefined;

  type Hit = {
    candidate: string;
    confidence: "high" | "medium";
    reason: string;
    exampleTag: string;
    exampleClasses: string[];
    occurrences: number;
  };

  const keyOf = (tag: string, classes: string[]) => `${tag}::${classes.filter(Boolean).slice().sort().join(" ")}`;

  const counts = new Map<string, Hit>();

  const classify = (tag: string, classes: string[]): Omit<Hit, "occurrences"> | null => {
    const hasRounded = classes.some((c) => c === "rounded" || c.startsWith("rounded-") || c.startsWith("rounded["));
    const hasBg = classes.some((c) => c === "bg" || c.startsWith("bg-") || c.startsWith("bg["));
    const hasPxPy = classes.some((c) => c.startsWith("px-") || c.startsWith("py-") || c.startsWith("p-") || c.startsWith("p["));
    const hasBorder = classes.includes("border") || classes.some((c) => c.startsWith("border-") || c.startsWith("border["));
    const hasFocusRing = classes.some((c) => c.includes("focus:ring"));

    if (tag === "button") {
      if (hasRounded && hasBg && hasPxPy) {
        return {
          candidate: "BaseButton",
          confidence: "high",
          reason: "button 태그 + bg/px(py)/rounded 조합(버튼 스타일 가능성 높음)",
          exampleTag: tag,
          exampleClasses: classes
        };
      }
      if (hasRounded && (hasBg || hasBorder)) {
        return {
          candidate: "BaseButton",
          confidence: "medium",
          reason: "button 태그 + rounded + (bg 또는 border) 조합(버튼 후보)",
          exampleTag: tag,
          exampleClasses: classes
        };
      }
    }

    if (tag === "input") {
      if (hasRounded && hasBorder && hasFocusRing) {
        return {
          candidate: "BaseInput",
          confidence: "high",
          reason: "input 태그 + border/rounded/focus:ring 조합(인풋 스타일 가능성 높음)",
          exampleTag: tag,
          exampleClasses: classes
        };
      }
      if (hasRounded && hasBorder) {
        return {
          candidate: "BaseInput",
          confidence: "medium",
          reason: "input 태그 + border/rounded 조합(인풋 후보)",
          exampleTag: tag,
          exampleClasses: classes
        };
      }
    }

    return null;
  };

  const isTextLike = (n: DSNode) => {
    if (n.kind !== "element") return false;
    const props: any = n.props || {};
    return typeof props.text === "string" && String(props.text).trim().length > 0;
  };

  const looksLikeInput = (n: DSNode) => n.kind === "element" && n.name === "input";

  const classifyContainerAsFormField = (n: DSNode): Omit<Hit, "occurrences"> | null => {
    if (!n || n.kind !== "element") return null;
    const tag = String(n.name || "");
    if (tag !== "div" && tag !== "form" && tag !== "section") return null;
    const kids = Array.isArray(n.children) ? n.children : [];
    if (kids.length < 2 || kids.length > 6) return null;

    const hasInput = kids.some(looksLikeInput);
    const textKids = kids.filter(isTextLike);

    if (!hasInput || textKids.length !== 1) return null;

    const classes = Array.isArray(n.classes) ? n.classes.filter(Boolean) : [];
    const hasFlexCol = classes.includes("flex") && classes.some((c) => c === "flex-col" || c.includes("flex-col"));
    const hasGap = classes.some((c) => c.startsWith("gap-") || c.startsWith("gap["));

    const confidence: "high" | "medium" = hasFlexCol || hasGap ? "high" : "medium";

    return {
      candidate: "FormField",
      confidence,
      reason:
        confidence === "high"
          ? "컨테이너(div) 내부에 라벨 텍스트 1개 + input 1개가 있고, flex-col/gap 힌트가 있어 FormField 구조 가능성 높음"
          : "컨테이너(div) 내부에 라벨 텍스트 1개 + input 1개가 있어 FormField 후보",
      exampleTag: tag,
      exampleClasses: classes
    };
  };

  const visit = (n: DSNode | undefined) => {
    if (!n) return;
    if (n.kind === "element" && (n.name === "button" || n.name === "input") && Array.isArray(n.classes)) {
      const classes = n.classes.filter(Boolean);
      const hit = classify(n.name, classes);
      if (hit) {
        const key = keyOf(n.name, classes);
        const prev = counts.get(key);
        if (prev) prev.occurrences += 1;
        else counts.set(key, { ...hit, occurrences: 1 });
      }
    }

    if (n.kind === "element") {
      const hit = classifyContainerAsFormField(n);
      if (hit) {
        const classes = Array.isArray(n.classes) ? n.classes.filter(Boolean) : [];
        const key = keyOf(`FormField@${n.name}`, classes);
        const prev = counts.get(key);
        if (prev) prev.occurrences += 1;
        else counts.set(key, { ...hit, occurrences: 1 });
      }
    }
    for (const c of n.children || []) visit(c);
  };

  visit(dsRoot.tree);

  const all = Array.from(counts.values());
  const score = (h: Hit) => (h.confidence === "high" ? 1_000_000 : 0) + h.occurrences;

  return all.sort((a, b) => score(b) - score(a)).slice(0, 8);
}

function buildManifestJson(dsRoot: DSRoot, target: string): string {
  const { ds, pathTried } = loadDesignSystemForManifest();
  const dsComponents = Object.keys(ds?.components || {}).sort();
  const generatedComponents = Object.keys(getComponentSources()).sort();
  const commonComponents = Array.from(new Set([...dsComponents, ...generatedComponents])).sort();

  const observedProps = collectComponentPropsSummary(dsRoot);
  const generatedPropsSpec = collectGeneratedComponentPropsSpec();
  const componentPropsSummary = mergePropsSummary(generatedPropsSpec, observedProps);

  const diagnosticsSample = (dsRoot?.diagnostics || [])
    .filter((d) => typeof d?.code === "string" && (/^HEURISTIC_/.test(d.code) || /^DS_/.test(d.code)))
    .slice(0, 25)
    .map((d) => ({
      severity: d.severity,
      code: d.code,
      message: d.message,
      nodeId: d.nodeId,
      namePath: Array.isArray(d?.ref?.namePath) ? d.ref!.namePath!.join("/") : undefined
    }));

  const manifest: Manifest = {
    schemaVersion: "0.1",
    generatedAt: new Date().toISOString(),
    policy: String(dsRoot?.meta?.policy || "RAW"),
    target: String(target || "nuxt"),
    ...(ds ? { designSystem: { name: ds?.name, tokensVersion: ds?.tokensVersion, pathTried } } : { designSystem: { pathTried } }),
    commonComponents,
    generatedComponents,
    componentPropsSummary,
    cursorGuidance: {
      uiChangeForbidden: true,
      preferComponents: commonComponents,
      fallbackRule: "치환 확신이 없거나 UI가 바뀔 위험이 있으면 기존 div/구조 유지(치환 강행 금지)",
      note: "RAW 출력물은 '날코딩'이므로, components/의 공통 컴포넌트를 최대한 임포트/치환하되 UI 변경은 금지한다."
    },
    ...(dsRoot?.meta?.policy === "RAW" ? { rawCandidatePatterns: collectRawCandidatePatterns(dsRoot) } : {}),
    ...(diagnosticsSample.length ? { hints: { diagnosticsSample } } : {})
  };

  return JSON.stringify(manifest, null, 2);
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escText(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toKebab(s: string) {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

type GenerateZipOptions = {
  componentSplit?: {
    items?: Array<{
      nodeId: string;
      fileBase: string;
    }>;
  };
};

type NormalizedComponentSplitItem = {
  nodeId: string;
  fileBase: string;
  componentName: string;
  depth: number;
};

function normalizeFigmaNodeId(s: string): string {
  const v = String(s || "").trim();
  if (!v) return "";
  // If a full Figma URL was passed, extract node-id.
  if (v.includes("figma.com")) {
    try {
      const u = new URL(v);
      const rawNode = u.searchParams.get("node-id") || "";
      if (rawNode) return rawNode.replace(/-/g, ":");
    } catch {
      // fall through
    }
  }
  // Figma copy link commonly uses "123-456" while API/node ids are "123:456"
  if (v.includes("-") && !v.includes(":")) return v.replace(/-/g, ":");
  return v;
}

function pascalCaseName(s: string): string {
  const v = String(s || "").trim();
  if (!v) return "";
  // split on non-alnum boundaries; keep camelCase as a single chunk (then just upper-case first char)
  const parts = v.replace(/[^A-Za-z0-9]+/g, " ").split(" ").filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

function isValidFileBase(s: string): boolean {
  const v = String(s || "").trim();
  // allow camelCase / PascalCase / kebab / snake (no spaces, no dots, no slashes)
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(v);
}

function findDepthByFigmaNodeId(node: DSNode | undefined, figmaNodeId: string, depth = 0): number | undefined {
  if (!node) return undefined;
  const id = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
  if (id && id === figmaNodeId) return depth;
  for (const c of node.children || []) {
    const d = findDepthByFigmaNodeId(c, figmaNodeId, depth + 1);
    if (d !== undefined) return d;
  }
  return undefined;
}

function replaceByFigmaNodeId(
  node: DSNode,
  figmaNodeId: string,
  replacement: DSNode
): { node: DSNode; extracted?: DSNode; found: boolean } {
  const id = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
  if (id && id === figmaNodeId) {
    return { node: replacement, extracted: node, found: true };
  }

  const kids = node.children || [];
  if (!kids.length) return { node, found: false };

  let extracted: DSNode | undefined;
  let found = false;
  const nextKids = kids.map((c) => {
    if (found) return c;
    const r = replaceByFigmaNodeId(c, figmaNodeId, replacement);
    if (r.found) {
      found = true;
      extracted = r.extracted;
    }
    return r.node;
  });

  if (!found) return { node, found: false };

  return {
    node: {
      ...node,
      children: nextKids
    },
    extracted,
    found: true
  };
}

function collectUsedSplitComponents(node: DSNode | undefined, splitNames: Set<string>, out: Set<string>) {
  if (!node) return;
  if (node.kind === "component") {
    const name = String(node.name || "");
    if (splitNames.has(name)) out.add(name);
  }
  for (const c of node.children || []) collectUsedSplitComponents(c, splitNames, out);
}

function buildSplitComponentSfc(templateHtml: string, imports: Array<{ name: string; rel: string }>): string {
  const importLines = imports.map((i) => `import ${i.name} from "${i.rel}";`);
  const script =
    importLines.length
      ? `\n\n<script setup lang="ts">\n${importLines.join("\n")}\n</script>\n`
      : "\n";

  return `<template>
  ${templateHtml}
</template>${script}`;
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

type ResponsivePolicyCtx = {
  applyRootAndWrapper: boolean;
  rootId: string;
  wrapperId?: string;
  designWidthPx?: number;
  designHeightPx?: number;
};

function parseArbitraryPxValue(cls: string, key: string): number | undefined {
  // key examples: "w", "h", "px", "pl", "pr", "gap", "gap-x", "gap-y", "max-w"
  const re = new RegExp(`^${key}-\\[(\\d+(?:\\.\\d+)?)px\\]$`);
  const m = cls.match(re);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function hasAnyPrefix(classes: string[], prefixes: string[]) {
  return classes.some((c) => prefixes.some((p) => c === p || c.startsWith(p)));
}

function uniqPreserveOrder(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of list) {
    const k = String(c || "").trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function buildResponsivePolicyCtx(root: DSNode, applyRootAndWrapper: boolean): ResponsivePolicyCtx {
  const classes = (root?.classes || []).filter(Boolean);
  const designWidthPx = parseArbitraryPxValue(classes.find((c) => /^w-\[\d+(?:\.\d+)?px\]$/.test(c)) || "", "w")
    ?? parseArbitraryPxValue(classes.find((c) => /^max-w-\[\d+(?:\.\d+)?px\]$/.test(c)) || "", "max-w");
  const designHeightPx = parseArbitraryPxValue(classes.find((c) => /^h-\[\d+(?:\.\d+)?px\]$/.test(c)) || "", "h");

  let wrapperId: string | undefined;
  if (applyRootAndWrapper && root?.children && root.children.length && designWidthPx) {
    const scoreChild = (n: DSNode) => {
      const cls = (n?.classes || []).filter(Boolean);
      const w = cls.map((c) => parseArbitraryPxValue(c, "w")).find((v) => v !== undefined);
      const pads = cls
        .map((c) => parseArbitraryPxValue(c, "px") ?? parseArbitraryPxValue(c, "pl") ?? parseArbitraryPxValue(c, "pr"))
        .filter((v): v is number => typeof v === "number");
      const maxPad = pads.length ? Math.max(...pads) : 0;

      let score = 0;
      if (w !== undefined) {
        const diff = Math.abs(w - designWidthPx);
        // Tight match to design width is a strong signal (e.g., 1920 wrapper)
        score += Math.max(0, 12 - diff / 16);
      }
      if (maxPad >= 160) score += 20 + maxPad / 100;
      else if (maxPad >= 80) score += 8 + maxPad / 100;
      if ((n.children || []).length) score += Math.min(10, (n.children || []).length / 2);
      if (String(n.name || "") === "div") score += 1;
      return score;
    };

    let best: { id: string; score: number } | null = null;
    for (const c of root.children) {
      const score = scoreChild(c);
      if (!best || score > best.score) best = { id: c.id, score };
    }
    if (best && best.score >= 10) wrapperId = best.id;
  }

  return {
    applyRootAndWrapper,
    rootId: String(root?.id || "root"),
    wrapperId,
    designWidthPx,
    designHeightPx
  };
}

function postProcessClassName(n: DSNode, classes: string[] | undefined, ctx: ResponsivePolicyCtx): string[] | undefined {
  const orig = (classes || []).filter(Boolean);
  if (!orig.length) return classes;

  const isRoot = ctx.applyRootAndWrapper && n.id === ctx.rootId;
  const isWrapper = ctx.applyRootAndWrapper && !!ctx.wrapperId && n.id === ctx.wrapperId;
  const hasJustifyBetween = orig.includes("justify-between");

  const out: string[] = [];
  for (const c0 of orig) {
    const c = String(c0 || "").trim();
    if (!c) continue;

    // Root policy: w-[DESIGN_WIDTHpx] -> w-full, h-[DESIGN_HEIGHTpx] -> min-h-screen
    if (isRoot) {
      const w = parseArbitraryPxValue(c, "w");
      if (w !== undefined && ctx.designWidthPx !== undefined && Math.abs(w - ctx.designWidthPx) <= 1) {
        if (!orig.includes("w-full")) out.push("w-full");
        continue; // drop fixed root width
      }
      const h = parseArbitraryPxValue(c, "h");
      if (h !== undefined && ctx.designHeightPx !== undefined && Math.abs(h - ctx.designHeightPx) <= 1) {
        if (!orig.includes("min-h-screen") && !orig.includes("min-h-dvh")) out.push("min-h-screen");
        continue; // drop fixed root height
      }
    }

    // Wrapper policy: ensure centered constrained container (mx-auto w-full max-w-[DESIGN_WIDTHpx])
    if (isWrapper) {
      const w = parseArbitraryPxValue(c, "w");
      if (w !== undefined && ctx.designWidthPx !== undefined && Math.abs(w - ctx.designWidthPx) <= 1) {
        // drop fixed wrapper width; we'll re-add as max-w below
        continue;
      }
    }

    // Padding clamp policy: px/pl/pr-[Npx] -> clamp(16px,3vw,Npx) for large values
    {
      const px = parseArbitraryPxValue(c, "px");
      if (px !== undefined && px >= 80) {
        out.push(`px-[clamp(16px,3vw,${px}px)]`);
        continue;
      }
      const pl = parseArbitraryPxValue(c, "pl");
      if (pl !== undefined && pl >= 80) {
        out.push(`pl-[clamp(16px,3vw,${pl}px)]`);
        continue;
      }
      const pr = parseArbitraryPxValue(c, "pr");
      if (pr !== undefined && pr >= 80) {
        out.push(`pr-[clamp(16px,3vw,${pr}px)]`);
        continue;
      }
    }

    // justify-between + big gap: remove big gaps since justify-between already distributes spacing
    {
      const gap = parseArbitraryPxValue(c, "gap");
      const gapx = parseArbitraryPxValue(c, "gap-x");
      const gapy = parseArbitraryPxValue(c, "gap-y");
      const g = gap ?? gapx ?? gapy;
      const key = gap !== undefined ? "gap" : gapx !== undefined ? "gap-x" : gapy !== undefined ? "gap-y" : null;
      if (g !== undefined && key) {
        if (hasJustifyBetween && g >= 80) {
          continue; // remove
        }
        if (g >= 80) {
          out.push(`${key}-[clamp(16px,2vw,${g}px)]`);
          continue;
        }
      }
    }

    // Large fixed width containers: w-[Npx] (N>=600) -> w-full max-w-[Npx]
    {
      const w = parseArbitraryPxValue(c, "w");
      if (w !== undefined && w >= 600 && (n.children || []).length) {
        // Avoid double-applying if already responsive-ish
        if (!hasAnyPrefix(orig, ["w-full", "max-w-["])) {
          out.push("w-full");
          out.push(`max-w-[${w}px]`);
          continue;
        }
      }
    }

    out.push(c);
  }

  // Wrapper additions (prepend so they don't get overridden by later width classes)
  if (isWrapper && ctx.designWidthPx !== undefined) {
    const add: string[] = [];
    if (!out.includes("mx-auto")) add.push("mx-auto");
    if (!out.includes("w-full")) add.push("w-full");
    const mw = `max-w-[${ctx.designWidthPx}px]`;
    if (!out.includes(mw)) add.push(mw);
    return uniqPreserveOrder([...add, ...out]);
  }

  return uniqPreserveOrder(out);
}

function renderClasses(classes?: string[]) {
  const list = (classes || []).filter(Boolean);
  if (!list.length) return "";
  return ` class="${escapeAttr(list.join(" "))}"`;
}

function renderNode(n: DSNode, ctx: ResponsivePolicyCtx): string {
  const tag = n.kind === "component" ? n.name : n.name;
  const props = renderProps(n.props);
  const processedClasses = postProcessClassName(n, n.classes, ctx);
  const cls = renderClasses(processedClasses);

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
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<BaseButton${cls}${p}>${escText(label)}</BaseButton>`;
  }

  if (tag === "Typography") {
    const text = String(n.props?.text ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).text;
    const p = renderProps(restProps);
    return `<Typography${cls}${p}>${escText(text)}</Typography>`;
  }

  if (tag === "BaseInput") {
    return `<BaseInput${cls}${props} />`;
  }

  if (tag === "BaseTextarea") {
    return `<BaseTextarea${cls}${props} />`;
  }

  if (tag === "BaseSelect") {
    return `<BaseSelect${cls}${props}>${(n.children || []).map((c) => renderNode(c, ctx)).join("\n")}</BaseSelect>`;
  }

  if (tag === "BaseCheckbox") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<BaseCheckbox${cls}${p}>${escText(label)}</BaseCheckbox>`;
  }

  if (tag === "BaseRadio") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<BaseRadio${cls}${p}>${escText(label)}</BaseRadio>`;
  }

  if (tag === "BaseSwitch") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<BaseSwitch${cls}${p}>${escText(label)}</BaseSwitch>`;
  }

  if (tag === "DropdownMenu") {
    const children = (n.children || []).map((c) => renderNode(c, ctx)).join("\n");
    return `<DropdownMenu${cls}${props}>${children ? "\n" + children + "\n" : ""}</DropdownMenu>`;
  }

  if (tag === "HamburgerButton") {
    return `<HamburgerButton${cls}${props} />`;
  }

  if (tag === "MenuList") {
    const children = (n.children || []).map((c) => renderNode(c, ctx)).join("\n");
    return `<MenuList${cls}${props}>${children ? "\n" + children + "\n" : ""}</MenuList>`;
  }

  if (tag === "ThumbnailCard") {
    const title = String(n.props?.title ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).title;
    const p = renderProps(restProps);
    const children = (n.children || []).map((c) => renderNode(c, ctx)).join("\n");
    return `<ThumbnailCard${cls}${p} title="${escapeAttr(title)}">${children ? "\n" + children + "\n" : ""}</ThumbnailCard>`;
  }

  if (tag === "Carousel") {
    const children = (n.children || []).map((c) => renderNode(c, ctx)).join("\n");
    return `<Carousel${cls}${props}>${children ? "\n" + children + "\n" : ""}</Carousel>`;
  }

  if (tag === "CalendarInput") {
    return `<CalendarInput${cls}${props} />`;
  }

  if (tag === "RangeSlider") {
    return `<RangeSlider${cls}${props} />`;
  }

  if (tag === "ToggleButton") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<ToggleButton${cls}${p}>${escText(label)}</ToggleButton>`;
  }

  if (tag === "Popup") {
    const title = String(n.props?.title ?? "Popup");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).title;
    const p = renderProps(restProps);
    const children = (n.children || []).map((c) => renderNode(c, ctx)).join("\n");
    return `<Popup${cls}${p} title="${escapeAttr(title)}">${children ? "\n" + children + "\n" : ""}</Popup>`;
  }

  if (tag === "Loading") {
    const label = String(n.props?.label ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).label;
    const p = renderProps(restProps);
    return `<Loading${cls}${p}>${label ? escText(label) : ""}</Loading>`;
  }

  if (tag === "Flag") {
    const text = String(n.props?.text ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).text;
    const p = renderProps(restProps);
    return `<Flag${cls}${p}>${escText(text)}</Flag>`;
  }

  if (tag === "Tabs") {
    const children = (n.children || []).map((c) => renderNode(c, ctx)).join("\n");
    return `<Tabs${cls}${props}>${children ? "\n" + children + "\n" : ""}</Tabs>`;
  }

  if (tag === "AlertDialog") {
    const title = String(n.props?.title ?? "알림");
    const message = String(n.props?.message ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).title;
    delete (restProps as any).message;
    const p = renderProps(restProps);
    return `<AlertDialog${cls}${p} title="${escapeAttr(title)}" message="${escapeAttr(message)}" />`;
  }

  if (tag === "UnsafeBox") {
    const children = (n.children || []).map((c) => renderNode(c, ctx)).join("\n");
    return `<UnsafeBox${cls}${props}>${children ? "\n" + children + "\n" : ""}</UnsafeBox>`;
  }

  const children = (n.children || []).map((c) => renderNode(c, ctx)).join("\n");
  return `<${tag}${cls}${props}>${children ? "\n" + children + "\n" : ""}</${tag}>`;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(p: string, content: string) {
  ensureDir(path.dirname(p));
  const ext = path.extname(p).toLowerCase();
  const out = ext === ".vue" ? formatVueSfcLight(content) : content;
  fs.writeFileSync(p, out, "utf-8");
}

type ComponentSources = {
  BaseButton: string;
  Typography: string;
  BaseInput: string;
  BaseTextarea: string;
  UnsafeBox: string;
  BaseSelect: string;
  BaseCheckbox: string;
  BaseRadio: string;
  BaseSwitch: string;
  DropdownMenu: string;
  HamburgerButton: string;
  MenuList: string;
  ThumbnailCard: string;
  Carousel: string;
  CalendarInput: string;
  RangeSlider: string;
  ToggleButton: string;
  Popup: string;
  Loading: string;
  Flag: string;
  Tabs: string;
  AlertDialog: string;
};

function getComponentSources(): ComponentSources {
  const BaseButton = `<template>
  <button :class="cls" type="button">
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  intent?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
}>();

const cls = computed(() => {
  const intent = props.intent || "primary";
  const size = props.size || "md";

  const sizeCls =
    size === "sm" ? "px-3 py-1.5 text-sm" :
    size === "lg" ? "px-5 py-3 text-base" :
    "px-4 py-2 text-sm";

  const intentCls =
    intent === "secondary" ? "bg-white text-[var(--ds-fg)] border border-[var(--ds-border)]" :
    intent === "danger" ? "bg-[var(--ds-danger)] text-white" :
    "bg-[var(--ds-primary)] text-white";

  return [
    "inline-flex items-center justify-center rounded-lg font-medium",
    sizeCls,
    intentCls,
    "shadow-sm",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)] focus:ring-offset-2"
  ].join(" ");
});
</script>
`;

  const Typography = `<template>
  <component :is="tag" :class="cls">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  variant?: "h1" | "h2" | "h3" | "body" | "caption";
  colorToken?: "fg" | "muted" | "primary" | "danger" | "border" | "surface";
}>();

const tag = computed(() => {
  const v = props.variant || "body";
  if (v === "h1") return "h1";
  if (v === "h2") return "h2";
  if (v === "h3") return "h3";
  return "span";
});

const cls = computed(() => {
  const v = props.variant || "body";
  const color =
    props.colorToken === "primary" ? "text-[var(--ds-primary)]" :
    props.colorToken === "danger" ? "text-[var(--ds-danger)]" :
    props.colorToken === "muted" ? "text-[var(--ds-muted)]" :
    props.colorToken === "fg" ? "text-[var(--ds-fg)]" :
    "";

  const size =
    v === "h1" ? "text-2xl font-semibold" :
    v === "h2" ? "text-xl font-semibold" :
    v === "h3" ? "text-lg font-semibold" :
    v === "caption" ? "text-xs text-[var(--ds-muted)]" :
    "text-sm";

  return [size, color].filter(Boolean).join(" ");
});
</script>
`;

  const BaseInput = `<template>
  <input :class="cls" :placeholder="placeholder" />
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ placeholder?: string }>();

const cls = computed(() =>
  "px-3 py-2 rounded-lg border border-[var(--ds-border)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
);
const placeholder = computed(() => props.placeholder || "");
</script>
`;

  const BaseTextarea = `<template>
  <textarea
    :class="cls"
    :placeholder="placeholder"
    :rows="rows"
    :value="modelValue"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  ></textarea>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  placeholder?: string;
  modelValue?: string;
  rows?: number;
}>();

defineEmits<{ (e: "update:modelValue", v: string): void }>();

const cls = computed(() =>
  [
    "px-3 py-2 rounded-lg border border-[var(--ds-border)] w-full",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]",
    "min-h-[96px] resize-y"
  ].join(" ")
);
const placeholder = computed(() => props.placeholder || "");
const modelValue = computed(() => props.modelValue || "");
const rows = computed(() => (typeof props.rows === "number" && props.rows > 0 ? props.rows : 3));
</script>
`;

  const UnsafeBox = `<template>
  <div class="border border-dashed border-slate-300 p-2 rounded">
    <slot />
  </div>
</template>
`;

  const BaseSelect = `<template>
  <div class="w-full">
    <select
      :class="cls"
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <slot />
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue?: string;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
}>();

defineEmits<{ (e: "update:modelValue", v: string): void }>();

const cls = computed(() => {
  const size = props.size ?? "md";
  const sizeCls =
    size === "sm" ? "px-3 py-1.5 text-sm" :
    size === "lg" ? "px-4 py-3 text-base" :
    "px-3 py-2 text-sm";
  return [
    "w-full rounded-lg border border-[var(--ds-border)] bg-white text-[var(--ds-fg)]",
    sizeCls,
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  ].join(" ");
});
</script>
`;

  const BaseCheckbox = `<template>
  <label class="inline-flex items-center gap-2">
    <input
      type="checkbox"
      :checked="checked"
      @change="$emit('update:checked', ($event.target as HTMLInputElement).checked)"
      :class="boxCls"
    />
    <span class="text-sm text-[var(--ds-fg)]"><slot>{{ label }}</slot></span>
  </label>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  checked?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
}>();

defineEmits<{ (e: "update:checked", v: boolean): void }>();

const boxCls = computed(() => {
  const size = props.size ?? "md";
  const sz = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return [
    sz,
    "rounded border border-[var(--ds-border)] text-[var(--ds-primary)]",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  ].join(" ");
});
</script>
`;

  const BaseRadio = `<template>
  <label class="inline-flex items-center gap-2">
    <input
      type="radio"
      :name="name"
      :checked="checked"
      @change="$emit('update:checked', ($event.target as HTMLInputElement).checked)"
      :class="dotCls"
    />
    <span class="text-sm text-[var(--ds-fg)]"><slot>{{ label }}</slot></span>
  </label>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  checked?: boolean;
  label?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
}>();

defineEmits<{ (e: "update:checked", v: boolean): void }>();

const dotCls = computed(() => {
  const size = props.size ?? "md";
  const sz = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return [
    sz,
    "border border-[var(--ds-border)] text-[var(--ds-primary)]",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  ].join(" ");
});
</script>
`;

  const BaseSwitch = `<template>
  <label class="inline-flex items-center gap-2">
    <button type="button" :class="trackCls" @click="$emit('update:checked', !checked)">
      <span :class="thumbCls"></span>
    </button>
    <span class="text-sm text-[var(--ds-fg)]"><slot>{{ label }}</slot></span>
  </label>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  checked?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
}>();

defineEmits<{ (e: "update:checked", v: boolean): void }>();

const trackCls = computed(() => {
  const size = props.size ?? "md";
  const wh = size === "sm" ? "w-8 h-4" : size === "lg" ? "w-12 h-6" : "w-10 h-5";
  const bg = props.checked ? "bg-[var(--ds-primary)]" : "bg-slate-300";
  return ["relative inline-flex items-center rounded-full transition", wh, bg].join(" ");
});

const thumbCls = computed(() => {
  const size = props.size ?? "md";
  const t = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const x = props.checked
    ? (size === "sm" ? "translate-x-4" : size === "lg" ? "translate-x-6" : "translate-x-5")
    : "translate-x-1";
  return ["inline-block rounded-full bg-white transition transform", t, x].join(" ");
});
</script>
`;

  const DropdownMenu = `<template>
  <div class="relative inline-block">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg border border-[var(--ds-border)] px-3 py-2 text-sm"
      @click="open = !open"
    >
      <slot name="trigger">Menu</slot>
      <span class="text-xs">▾</span>
    </button>
    <div
      v-if="open"
      class="absolute z-50 mt-2 min-w-[10rem] rounded-lg border border-[var(--ds-border)] bg-white shadow-sm p-1"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
const open = ref(false);
</script>
`;

  const HamburgerButton = `<template>
  <button
    type="button"
    class="inline-flex items-center justify-center rounded-lg border border-[var(--ds-border)] p-2"
    aria-label="Menu"
  >
    <span class="block h-0.5 w-5 bg-[var(--ds-fg)]"></span>
    <span class="block h-0.5 w-5 bg-[var(--ds-fg)] mt-1.5"></span>
    <span class="block h-0.5 w-5 bg-[var(--ds-fg)] mt-1.5"></span>
  </button>
</template>
`;

  const MenuList = `<template>
  <ul class="min-w-[10rem] rounded-lg border border-[var(--ds-border)] bg-white p-1">
    <slot />
  </ul>
</template>
`;

  const ThumbnailCard = `<template>
  <div class="rounded-xl border border-[var(--ds-border)] bg-white shadow-sm overflow-hidden">
    <div class="aspect-[16/9] bg-slate-100">
      <slot name="thumbnail" />
    </div>
    <div class="p-4">
      <div v-if="title" class="text-sm font-semibold text-[var(--ds-fg)]">{{ title }}</div>
      <div class="mt-1 text-sm text-[var(--ds-muted)]"><slot /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ title?: string }>();
</script>
`;

  const Carousel = `<template>
  <div class="w-full overflow-x-auto">
    <div class="flex gap-3 w-max">
      <slot />
    </div>
  </div>
</template>
`;

  const CalendarInput = `<template>
  <input
    type="date"
    :value="modelValue"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    class="px-3 py-2 rounded-lg border border-[var(--ds-border)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]"
  />
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue?: string }>();
defineEmits<{ (e: "update:modelValue", v: string): void }>();
</script>
`;

  const RangeSlider = `<template>
  <div class="w-full">
    <input
      type="range"
      :min="min"
      :max="max"
      :value="modelValue"
      @input="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
      class="w-full"
    />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue?: number; min?: number; max?: number }>();
defineEmits<{ (e: "update:modelValue", v: number): void }>();
</script>
`;

  const ToggleButton = `<template>
  <button type="button" :class="cls" @click="$emit('update:checked', !checked)">
    <slot>{{ label }}</slot>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  checked?: boolean;
  label?: string;
  intent?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
}>();

defineEmits<{ (e: "update:checked", v: boolean): void }>();

const cls = computed(() => {
  const intent = props.intent || "primary";
  const size = props.size || "md";
  const checked = props.checked || false;

  const sizeCls =
    size === "sm" ? "px-3 py-1.5 text-sm" :
    size === "lg" ? "px-5 py-3 text-base" :
    "px-4 py-2 text-sm";

  const intentCls =
    intent === "secondary" ? "bg-white text-[var(--ds-fg)] border border-[var(--ds-border)]" :
    intent === "danger" ? "bg-[var(--ds-danger)] text-white" :
    "bg-[var(--ds-primary)] text-white";

  return [
    "inline-flex items-center justify-center rounded-lg font-medium transition",
    sizeCls,
    intentCls,
    checked ? "opacity-100" : "opacity-70",
    "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)] focus:ring-offset-2"
  ].join(" ");
});
</script>
`;

  const Popup = `<template>
  <div class="relative w-full rounded-2xl bg-white border border-[var(--ds-border)] shadow-sm">
    <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--ds-border)]">
      <div class="text-sm font-semibold text-[var(--ds-fg)]">{{ title }}</div>
      <button type="button" class="text-sm text-[var(--ds-muted)]" @click="$emit('close')">닫기</button>
    </div>
    <div class="p-5">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ title?: string }>();
defineEmits<{ (e: "close"): void }>();
</script>
`;

  const Loading = `<template>
  <div class="inline-flex items-center gap-2">
    <span :class="spinnerCls"></span>
    <span v-if="label" class="text-sm text-[var(--ds-muted)]">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  label?: string;
  size?: "sm" | "md" | "lg";
}>();

const spinnerCls = computed(() => {
  const size = props.size || "md";
  const wh = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return [wh, "rounded-full border-2 border-slate-200 border-t-[var(--ds-primary)] animate-spin"].join(" ");
});
</script>
`;

  const Flag = `<template>
  <span :class="cls">
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  text?: string;
  intent?: "primary" | "secondary" | "danger" | "muted";
}>();

const cls = computed(() => {
  const intent = props.intent || "secondary";
  const skin =
    intent === "primary" ? "bg-[var(--ds-primary)] text-white" :
    intent === "danger" ? "bg-[var(--ds-danger)] text-white" :
    intent === "muted" ? "bg-slate-100 text-[var(--ds-muted)]" :
    "bg-white text-[var(--ds-fg)] border border-[var(--ds-border)]";
  return ["inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", skin].join(" ");
});
</script>
`;

  const Tabs = `<template>
  <div class="w-full">
    <div class="flex items-center gap-2 border-b border-[var(--ds-border)]">
      <button
        v-for="(t, idx) in tabs"
        :key="idx"
        type="button"
        :class="tabsBtnClass(String(t.value))"
        @click="$emit('update:modelValue', t.value)"
      >
        {{ String(t.label) }}
      </button>
    </div>
    <div class="pt-4">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue?: string;
  tabs?: Array<{ label: string; value: string }>;
}>();

defineEmits<{ (e: "update:modelValue", v: string): void }>();

function tabsBtnClass(v: string) {
  const active = String(props.modelValue ?? "") === v;
  return [
    "text-sm px-3 py-2 -mb-px border-b-2 transition",
    active ? "border-[var(--ds-primary)] text-[var(--ds-fg)] font-medium" : "border-transparent text-[var(--ds-muted)]"
  ].join(" ");
}
</script>
`;

  const AlertDialog = `<template>
  <div class="relative w-full rounded-2xl bg-white border border-[var(--ds-border)] shadow-sm">
    <div class="px-5 py-4 border-b border-[var(--ds-border)]">
      <div class="text-sm font-semibold text-[var(--ds-fg)]">{{ title }}</div>
    </div>
    <div class="p-5">
      <div class="text-sm text-[var(--ds-muted)] whitespace-pre-wrap">{{ message }}</div>
    </div>
    <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--ds-border)]">
      <button type="button" class="px-3 py-2 text-sm rounded-lg border border-[var(--ds-border)]" @click="$emit('cancel')">취소</button>
      <button type="button" class="px-3 py-2 text-sm rounded-lg bg-[var(--ds-primary)] text-white" @click="$emit('confirm')">확인</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  title?: string;
  message?: string;
}>();

defineEmits<{ (e: "cancel"): void; (e: "confirm"): void }>();
</script>
`;

  return {
    BaseButton,
    Typography,
    BaseInput,
    BaseTextarea,
    UnsafeBox,
    BaseSelect,
    BaseCheckbox,
    BaseRadio,
    BaseSwitch,
    DropdownMenu,
    HamburgerButton,
    MenuList,
    ThumbnailCard,
    Carousel,
    CalendarInput,
    RangeSlider,
    ToggleButton,
    Popup,
    Loading,
    Flag,
    Tabs,
    AlertDialog
  };
}

function nuxtFiles(appHtml: string, dsRoot: DSRoot): Record<string, string> {
  const diagnosticsJson = JSON.stringify(dsRoot.diagnostics || [], null, 2);
  const isRaw = dsRoot?.meta?.policy === "RAW";
  const c = getComponentSources();

  const appVue = isRaw
    ? `<template>
  <GeneratedScreen />
</template>
`
    : `<template>
  <div class="min-h-screen bg-white text-slate-900">
    <main class="mx-auto flex justify-center">
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

@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap");

:root{
  --ds-primary: #2563eb;
  --ds-danger: #dc2626;
  --ds-fg: #0f172a;
  --ds-muted: #475569;
  --ds-surface: #ffffff;
  --ds-border: #e2e8f0;
}

html, body {
  font-family: "Noto Sans KR", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo",
    "Malgun Gothic", sans-serif;
}
`,
    "app.vue": appVue,
    "components/GeneratedScreen.vue": generatedScreenVue,

    "components/BaseButton.vue": c.BaseButton,
    "components/Typography.vue": c.Typography,
    "components/BaseInput.vue": c.BaseInput,
    "components/BaseTextarea.vue": c.BaseTextarea,
    "components/UnsafeBox.vue": c.UnsafeBox,
    "components/BaseSelect.vue": c.BaseSelect,
    "components/BaseCheckbox.vue": c.BaseCheckbox,
    "components/BaseRadio.vue": c.BaseRadio,
    "components/BaseSwitch.vue": c.BaseSwitch,
    "components/DropdownMenu.vue": c.DropdownMenu,
    "components/HamburgerButton.vue": c.HamburgerButton,
    "components/MenuList.vue": c.MenuList,
    "components/ThumbnailCard.vue": c.ThumbnailCard,
    "components/Carousel.vue": c.Carousel,
    "components/CalendarInput.vue": c.CalendarInput,
    "components/RangeSlider.vue": c.RangeSlider,
    "components/ToggleButton.vue": c.ToggleButton,
    "components/Popup.vue": c.Popup,
    "components/Loading.vue": c.Loading,
    "components/Flag.vue": c.Flag,
    "components/Tabs.vue": c.Tabs,
    "components/AlertDialog.vue": c.AlertDialog,

    "generated/diagnostics.json": diagnosticsJson
  };
}

function viteFiles(appHtml: string, dsRoot: DSRoot): Record<string, string> {
  const diagnosticsJson = JSON.stringify(dsRoot.diagnostics || [], null, 2);
  const isRaw = dsRoot?.meta?.policy === "RAW";
  const c = getComponentSources();

  const appVue = isRaw
    ? `<template>
  ${appHtml}
</template>
`
    : `<template>
  <div class="min-h-screen bg-white text-slate-900">
    <main class="mx-auto flex justify-center">
      ${appHtml}
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
  plugins: [
    vue({
      template: {
        transformAssetUrls: {
          includeAbsolute: false
        }
      }
    })
  ]
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

@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap");

:root{
  --ds-primary: #2563eb;
  --ds-danger: #dc2626;
  --ds-fg: #0f172a;
  --ds-muted: #475569;
  --ds-surface: #ffffff;
  --ds-border: #e2e8f0;
}

html, body {
  font-family: "Noto Sans KR", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo",
    "Malgun Gothic", sans-serif;
}
`,
    "src/main.ts": `import { createApp } from "vue";
import App from "./App.vue";
import "./styles/tailwind.css";

import BaseButton from "./components/BaseButton.vue";
import Typography from "./components/Typography.vue";
import BaseInput from "./components/BaseInput.vue";
import BaseTextarea from "./components/BaseTextarea.vue";
import UnsafeBox from "./components/UnsafeBox.vue";

import BaseSelect from "./components/BaseSelect.vue";
import BaseCheckbox from "./components/BaseCheckbox.vue";
import BaseRadio from "./components/BaseRadio.vue";
import BaseSwitch from "./components/BaseSwitch.vue";
import DropdownMenu from "./components/DropdownMenu.vue";
import HamburgerButton from "./components/HamburgerButton.vue";
import MenuList from "./components/MenuList.vue";
import ThumbnailCard from "./components/ThumbnailCard.vue";
import Carousel from "./components/Carousel.vue";
import CalendarInput from "./components/CalendarInput.vue";
import RangeSlider from "./components/RangeSlider.vue";
import ToggleButton from "./components/ToggleButton.vue";
import Popup from "./components/Popup.vue";
import Loading from "./components/Loading.vue";
import Flag from "./components/Flag.vue";
import Tabs from "./components/Tabs.vue";
import AlertDialog from "./components/AlertDialog.vue";

const app = createApp(App);

app.component("BaseButton", BaseButton);
app.component("Typography", Typography);
app.component("BaseInput", BaseInput);
app.component("BaseTextarea", BaseTextarea);
app.component("UnsafeBox", UnsafeBox);

app.component("BaseSelect", BaseSelect);
app.component("BaseCheckbox", BaseCheckbox);
app.component("BaseRadio", BaseRadio);
app.component("BaseSwitch", BaseSwitch);
app.component("DropdownMenu", DropdownMenu);
app.component("HamburgerButton", HamburgerButton);
app.component("MenuList", MenuList);
app.component("ThumbnailCard", ThumbnailCard);
app.component("Carousel", Carousel);
app.component("CalendarInput", CalendarInput);
app.component("RangeSlider", RangeSlider);
app.component("ToggleButton", ToggleButton);
app.component("Popup", Popup);
app.component("Loading", Loading);
app.component("Flag", Flag);
app.component("Tabs", Tabs);
app.component("AlertDialog", AlertDialog);

app.mount("#app");
`,
    "src/App.vue": appVue,

    "src/components/BaseButton.vue": c.BaseButton,
    "src/components/Typography.vue": c.Typography,
    "src/components/BaseInput.vue": c.BaseInput,
    "src/components/BaseTextarea.vue": c.BaseTextarea,
    "src/components/UnsafeBox.vue": c.UnsafeBox,
    "src/components/BaseSelect.vue": c.BaseSelect,
    "src/components/BaseCheckbox.vue": c.BaseCheckbox,
    "src/components/BaseRadio.vue": c.BaseRadio,
    "src/components/BaseSwitch.vue": c.BaseSwitch,
    "src/components/DropdownMenu.vue": c.DropdownMenu,
    "src/components/HamburgerButton.vue": c.HamburgerButton,
    "src/components/MenuList.vue": c.MenuList,
    "src/components/ThumbnailCard.vue": c.ThumbnailCard,
    "src/components/Carousel.vue": c.Carousel,
    "src/components/CalendarInput.vue": c.CalendarInput,
    "src/components/RangeSlider.vue": c.RangeSlider,
    "src/components/ToggleButton.vue": c.ToggleButton,
    "src/components/Popup.vue": c.Popup,
    "src/components/Loading.vue": c.Loading,
    "src/components/Flag.vue": c.Flag,
    "src/components/Tabs.vue": c.Tabs,
    "src/components/AlertDialog.vue": c.AlertDialog,

    "public/assets/.gitkeep": "",
    "src/generated/diagnostics.json": diagnosticsJson
  };
}

@Injectable()
export class CodegenService {
  private outDir: string;
  private readonly logger = new Logger(CodegenService.name);

  constructor(private readonly mcp: McpClient) {
    this.outDir = path.join(process.cwd(), ".out");
    ensureDir(this.outDir);
  }

  private shouldRefineMixed(dsRoot: DSRoot): boolean {
    const policy = String(dsRoot?.meta?.policy || "");
    if (policy !== "MIXED") return false;
    if (!process.env.OPENAI_API_KEY) {
      this.logger.warn("[MIXED] GPT refine skipped: OPENAI_API_KEY is not set");
      return false;
    }
    if (String(process.env.A2UI_MIXED_GPT || "").trim() === "0") {
      this.logger.warn("[MIXED] GPT refine skipped: A2UI_MIXED_GPT=0");
      return false;
    }
    return true;
  }

  private async refineWithGpt4Mini(inputVueSfc: string, target: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return inputVueSfc;

    const model = String(process.env.OPENAI_MODEL || "gpt-4o-mini");
    const { packed, classMap, styleMap } = packRepeatedAttrs(inputVueSfc);

    const userPrompt = [
      `너는 Vue/Nuxt 프론트엔드 시니어 개발자다.`,
      ``,
      `작업: 아래 Vue SFC를 "포맷팅(들여쓰기/줄바꿈/정렬)"만 정리해라.`,
      `중요: UI/레이아웃이 1px라도 바뀌면 안 된다.`,
      ``,
      `절대 금지(매우 중요):`,
      `- <template> 안에서 태그 추가/삭제/이동/병합/분리/재배치 금지`,
      `- attribute 추가/삭제/이동/이름 변경/순서 변경 금지`,
      `- class/style 값 변경 금지 (토큰 포함)`,
      `- 토큰(__CLS_#__ / __STYLE_#__ )은 "같은 요소"에 그대로 유지(다른 요소로 이동 금지)`,
      `- 컴포넌트 치환 금지(BaseButton/BaseInput 등으로 교체 금지)`,
      `- v-for, v-if 구조화/추출 금지`,
      `- wrapper 제거/최소화 금지`,
      `- script/setup 추가/삭제/변경 금지`,
      ``,
      `허용되는 변경: 공백, 줄바꿈, 들여쓰기만.`,
      ``,
      `target: ${String(target || "nuxt")}`,
      ``,
      `CLASS_MAP(JSON):`,
      JSON.stringify(classMap),
      ``,
      `STYLE_MAP(JSON):`,
      JSON.stringify(styleMap),
      ``,
      `INPUT_VUE_SFC:`,
      packed
    ].join("\n");

    try {
      this.logger.log(
        `[MIXED] GPT refine start: model=${model} target=${String(target || "")} bytes=${Buffer.byteLength(packed, "utf8")}`
      );
      const r = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model,
          temperature: 0.0,
          max_tokens: 3500,
          messages: [
            {
              role: "system",
              content:
                "Return only the Vue SFC code. Do not include markdown fences or commentary. Preserve template structure exactly; only whitespace changes are allowed."
            },
            { role: "user", content: userPrompt }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          timeout: 120000
        }
      );

      const content = stripMarkdownCodeFences(r?.data?.choices?.[0]?.message?.content || "");
      if (!content || !content.includes("<template")) {
        this.logger.warn("[MIXED] GPT refine: empty/invalid response, fallback to original");
        return inputVueSfc;
      }

      const validatedPacked = validateRefinedPackedSfcOrNull(packed, content, classMap, styleMap);
      if (!validatedPacked) {
        this.logger.warn("[MIXED] GPT refine: validation failed (structure/token mismatch), fallback to original");
        return inputVueSfc;
      }

      const out = unpackAttrs(validatedPacked, classMap, styleMap);
      this.logger.log(`[MIXED] GPT refine done: bytes=${Buffer.byteLength(out, "utf8")}`);
      return out;
    } catch (e: any) {
      this.logger.warn(`[MIXED] GPT refine failed, fallback to original: ${e?.message || String(e)}`);
      return inputVueSfc;
    }
  }

  private readonly supportedAssetFormats = new Set(["png", "jpg", "svg"]);

  private parseFigmaPlaceholder(src: string): { format?: "png" | "jpg" | "svg"; nodeId?: string } | null {
    const s = String(src || "");
    // New format: __FIGMA_NODE__|<fmt>|<nodeId>
    if (s.startsWith("__FIGMA_NODE__|")) {
      const parts = s.split("|");
      // ["__FIGMA_NODE__", "<fmt>", "<nodeId...>"]
      const fmt = String(parts[1] || "").toLowerCase();
      const nodeId = parts.slice(2).join("|");
      const format = this.supportedAssetFormats.has(fmt) ? (fmt as any) : undefined;
      return { format, nodeId: nodeId || undefined };
    }
    // Legacy format: __FIGMA_NODE__:<nodeId> (nodeId can contain ":")
    if (s.startsWith("__FIGMA_NODE__:")) {
      const nodeId = s.slice("__FIGMA_NODE__:".length);
      return { nodeId: nodeId || undefined };
    }
    return null;
  }

  private inferAssetFormatFromImgNode(node: DSNode): "png" | "jpg" | "svg" {
    const src = String((node.props as any)?.src || "");
    const parsed = this.parseFigmaPlaceholder(src);
    if (parsed?.format) return parsed.format;

    // If already rewritten to local assets, infer from extension.
    const m = src.toLowerCase().match(/\.(png|jpg|svg)(?:\?|#|$)/);
    if (m?.[1] && this.supportedAssetFormats.has(m[1])) return m[1] as any;

    // Heuristic fallback: alt/name suffix (some teams name layers like "icon.svg" / "photo.jpg").
    const alt = String((node.props as any)?.alt || "");
    const nm = alt.trim().toLowerCase();
    if (nm.endsWith(".svg")) return "svg";
    if (nm.endsWith(".jpg") || nm.endsWith(".jpeg")) return "jpg";
    return "png";
  }

  private collectFigmaAssetRequests(node: DSNode, out: Map<"png" | "jpg" | "svg", Set<string>>) {
    if (!node) return;
    if (node.kind === "element" && node.name === "img") {
      const id = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
      if (id) {
        const fmt = this.inferAssetFormatFromImgNode(node);
        const set = out.get(fmt) || new Set<string>();
        set.add(id);
        out.set(fmt, set);
      }
    }
    for (const c of node.children || []) this.collectFigmaAssetRequests(c, out);
  }

  async resolveFigmaAssetUrls(dsRoot: DSRoot): Promise<void> {
    const fileKey = dsRoot?.meta?.fileKey;
    if (!fileKey) return;

    const byFormat = new Map<"png" | "jpg" | "svg", Set<string>>();
    this.collectFigmaAssetRequests(dsRoot.tree, byFormat);
    if (byFormat.size === 0) return;

    const idToUrl = new Map<string, string>();
    for (const [format, ids] of byFormat.entries()) {
      const idList = Array.from(ids);
      const chunks: string[][] = [];
      for (let i = 0; i < idList.length; i += 50) chunks.push(idList.slice(i, i + 50));

      for (const chunk of chunks) {
        try {
          const r: any = await this.mcp.invokeTool("figma.getImages", {
            fileKey,
            ids: chunk,
            format,
            scale: 2
          });
          const images = r?.images || {};
          for (const [k, v] of Object.entries(images)) {
            if (typeof v === "string" && v) idToUrl.set(`${format}|${k}`, v);
          }
        } catch {
          // ignore chunk failures
        }
      }
    }

    const rewrite = (node: DSNode) => {
      if (!node) return;
      if (node.kind === "element" && node.name === "img") {
        const nodeId = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
        const p = node.props || {};
        const src = String((p as any).src || "");
        const fmt = this.inferAssetFormatFromImgNode(node);
        const next = nodeId ? idToUrl.get(`${fmt}|${nodeId}`) : undefined;
        if (next && (src.startsWith("__FIGMA_NODE__") || src.startsWith("/assets/figma/") || !src)) {
          node.props = { ...p, src: next };
        }
      }
      for (const c of node.children || []) rewrite(c);
    };
    rewrite(dsRoot.tree);
  }

  private async resolveFigmaAssets(dsRoot: DSRoot, projectDir: string) {
    const fileKey = dsRoot?.meta?.fileKey;
    if (!fileKey) return;

    const byFormat = new Map<"png" | "jpg" | "svg", Set<string>>();
    this.collectFigmaAssetRequests(dsRoot.tree, byFormat);
    if (byFormat.size === 0) return;

    const assetRelDir = "public/assets/figma";
    const assetAbsDir = path.join(projectDir, assetRelDir);
    ensureDir(assetAbsDir);

    const idToUrl = new Map<string, string>();
    for (const [format, ids] of byFormat.entries()) {
      const idList = Array.from(ids);
      const chunks: string[][] = [];
      for (let i = 0; i < idList.length; i += 50) chunks.push(idList.slice(i, i + 50));

      for (const chunk of chunks) {
        const r: any = await this.mcp.invokeTool("figma.getImages", {
          fileKey,
          ids: chunk,
          format,
          scale: 2
        });
        const images = r?.images || {};
        for (const [k, v] of Object.entries(images)) {
          if (typeof v === "string" && v) idToUrl.set(`${format}|${k}`, v);
        }
      }
    }

    for (const [key, url] of idToUrl.entries()) {
      const bar = key.indexOf("|");
      const format = (bar >= 0 ? key.slice(0, bar) : "png") as "png" | "jpg" | "svg";
      const nodeId = bar >= 0 ? key.slice(bar + 1) : key;
      try {
        const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 45000 });
        const safe = nodeId.replace(/[^a-zA-Z0-9._-]/g, "_");
        fs.writeFileSync(path.join(assetAbsDir, `${safe}.${format}`), Buffer.from(resp.data));
      } catch {
        // ignore single asset failures
      }
    }

    const rewrite = (node: DSNode) => {
      if (!node) return;
      if (node.kind === "element" && node.name === "img") {
        const nodeId = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
        if (!nodeId) return;
        const safe = nodeId.replace(/[^a-zA-Z0-9._-]/g, "_");
        const p = node.props || {};
        const src = String((p as any).src || "");
        const fmt = this.inferAssetFormatFromImgNode(node);
        if (!src || src.startsWith("__FIGMA_NODE__")) {
          node.props = { ...p, src: `/assets/figma/${safe}.${fmt}` };
        }
      }
      for (const c of node.children || []) rewrite(c);
    };
    rewrite(dsRoot.tree);
  }

  async generateZip(projectId: string, target: string, dsRootInput: DSRoot, options: GenerateZipOptions = {}): Promise<string> {
    const id = uuid().slice(0, 8);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `a2ui-${projectId}-${id}-`));

    // Avoid mutating caller's object (JobsService stores dsSpec on artifact later).
    const dsRoot = JSON.parse(JSON.stringify(dsRootInput || {})) as DSRoot;

    await this.resolveFigmaAssets(dsRoot, dir);

    const rawItems = Array.isArray(options?.componentSplit?.items) ? options.componentSplit!.items! : [];
    const normalizedItems: NormalizedComponentSplitItem[] = [];

    if (rawItems.length) {
      const reserved = new Set<string>(["GeneratedScreen", ...Object.keys(getComponentSources())]);
      const seenNodeIds = new Set<string>();
      const seenFileBase = new Set<string>();
      const seenComponent = new Set<string>();

      for (const it of rawItems) {
        const nodeId = normalizeFigmaNodeId(String((it as any)?.nodeId || ""));
        const fileBase = String((it as any)?.fileBase || "").trim();
        if (!nodeId) throw new Error("componentSplit.items[].nodeId is required");
        if (!fileBase) throw new Error("componentSplit.items[].fileBase is required");
        if (!isValidFileBase(fileBase)) throw new Error(`Invalid componentSplit fileBase: ${fileBase}`);

        const componentName = pascalCaseName(fileBase);
        if (!componentName) throw new Error(`Invalid component name derived from fileBase: ${fileBase}`);
        if (reserved.has(componentName)) throw new Error(`Reserved component name not allowed: ${componentName}`);

        if (seenNodeIds.has(nodeId)) throw new Error(`Duplicate nodeId in componentSplit: ${nodeId}`);
        if (seenFileBase.has(fileBase)) throw new Error(`Duplicate fileBase in componentSplit: ${fileBase}`);
        if (seenComponent.has(componentName)) throw new Error(`Duplicate componentName in componentSplit: ${componentName}`);

        const depth = findDepthByFigmaNodeId(dsRoot.tree, nodeId, 0);
        if (depth === undefined) throw new Error(`componentSplit nodeId not found in ds tree: ${nodeId}`);

        seenNodeIds.add(nodeId);
        seenFileBase.add(fileBase);
        seenComponent.add(componentName);

        normalizedItems.push({ nodeId, fileBase, componentName, depth });
      }

      // process deepest nodes first so parent splits can include child components.
      normalizedItems.sort((a, b) => b.depth - a.depth);
    }

    const splitComponents: Array<{ fileBase: string; componentName: string; node: DSNode }> = [];

    if (normalizedItems.length) {
      for (const it of normalizedItems) {
        const replacement: DSNode = {
          id: `split:${it.nodeId}`,
          kind: "component",
          name: it.componentName,
          props: {},
          classes: [],
          children: []
        };
        const r = replaceByFigmaNodeId(dsRoot.tree, it.nodeId, replacement);
        if (!r.found || !r.extracted) throw new Error(`componentSplit nodeId not found (race): ${it.nodeId}`);
        dsRoot.tree = r.node;
        splitComponents.push({ fileBase: it.fileBase, componentName: it.componentName, node: r.extracted });
      }
    }

    const screenCtx = buildResponsivePolicyCtx(dsRoot.tree, true);
    const screen = renderNode(dsRoot.tree, screenCtx);
    const t = String(target || "nuxt").toLowerCase();

    let files: Record<string, string> = t === "vue" ? viteFiles(screen, dsRoot) : nuxtFiles(screen, dsRoot);

    // Component splitting requires stable <script setup> imports; skip GPT refine to avoid accidental script changes.
    const hasSplit = splitComponents.length > 0;

    if (hasSplit) {
      const splitNameSet = new Set(splitComponents.map((c) => c.componentName));
      const isNuxt = t !== "vue";
      const compDir = isNuxt ? "components" : "src/components";

      // Write split component files first.
      for (const c of splitComponents) {
        // For split components: keep root/wrapper-specific rules off to avoid structural/layout drift,
        // but keep generic responsive fixes (padding/gap/large widths) active.
        const compCtx = buildResponsivePolicyCtx(c.node, false);
        const html = renderNode(c.node, compCtx);
        const used = new Set<string>();
        collectUsedSplitComponents(c.node, splitNameSet, used);
        used.delete(c.componentName);
        const imports = Array.from(used)
          .sort()
          .map((name) => {
            const other = splitComponents.find((x) => x.componentName === name);
            const rel = other ? `./${other.fileBase}.vue` : `./${name}.vue`;
            return { name, rel };
          });
        files[`${compDir}/${c.fileBase}.vue`] = buildSplitComponentSfc(html, imports);
      }

      // GeneratedScreen should import the top-level used split components (vue target needs it, nuxt doesn't but harmless).
      const usedTop = new Set<string>();
      collectUsedSplitComponents(dsRoot.tree, splitNameSet, usedTop);
      const screenImports = Array.from(usedTop)
        .sort()
        .map((name) => {
          const other = splitComponents.find((x) => x.componentName === name);
          const rel = other ? `./${other.fileBase}.vue` : `./${name}.vue`;
          return { name, rel };
        });

      const generatedScreenSfc = buildSplitComponentSfc(screen, screenImports);

      if (isNuxt) {
        files["components/GeneratedScreen.vue"] = generatedScreenSfc;
      } else {
        files["src/components/GeneratedScreen.vue"] = generatedScreenSfc;
        const isRaw = dsRoot?.meta?.policy === "RAW";
        files["src/App.vue"] = isRaw
          ? `<template>
  <GeneratedScreen />
</template>

<script setup lang="ts">
import GeneratedScreen from "./components/GeneratedScreen.vue";
</script>
`
          : `<template>
  <div class="min-h-screen bg-white text-slate-900">
    <main class="mx-auto flex justify-center">
      <GeneratedScreen />
    </main>
  </div>
</template>

<script setup lang="ts">
import GeneratedScreen from "./components/GeneratedScreen.vue";
import diagnostics from "./generated/diagnostics.json";
</script>
`;
      }
    }

    if (!hasSplit && this.shouldRefineMixed(dsRoot)) {
      if (t === "nuxt") {
        const key = "components/GeneratedScreen.vue";
        const original = String(files[key] || "");
        if (original) {
          this.logger.log("[MIXED] refining components/GeneratedScreen.vue (nuxt)");
          files[key] = await this.refineWithGpt4Mini(original, t);
        }
      } else if (t === "vue") {
        this.logger.log("[MIXED] refining src/components/GeneratedScreen.vue (vue)");
        const screenSfc = `<template>
  ${screen}
</template>
`;
        const refined = await this.refineWithGpt4Mini(screenSfc, t);

        files["src/components/GeneratedScreen.vue"] = refined;
        files["src/App.vue"] = `<template>
  <div class="min-h-screen bg-white text-slate-900">
    <main class="mx-auto flex justify-center">
      <GeneratedScreen />
      <details class="mt-10">
        <summary class="cursor-pointer text-sm text-slate-600">Mapping diagnostics</summary>
        <pre class="mt-3 text-xs whitespace-pre-wrap text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-4">{{ diagnostics }}</pre>
      </details>
    </main>
  </div>
</template>

<script setup lang="ts">
import GeneratedScreen from "./components/GeneratedScreen.vue";
import diagnostics from "./generated/diagnostics.json";
</script>
`;
      }
    }

    files = {
      ...files,
      "README.md": buildReadmeMarkdown(t),
      "README_refactor.md": buildReadmeRefactorMarkdown(),
      "manifest.json": buildManifestJson(dsRoot, t)
    };

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

  renderVueSources(dsRoot: DSRoot, target: string): Record<string, string> {
    const screenCtx = buildResponsivePolicyCtx(dsRoot.tree, true);
    const screen = renderNode(dsRoot.tree, screenCtx);
    const t = String(target || "nuxt").toLowerCase();

    const base = t === "vue" ? viteFiles(screen, dsRoot) : nuxtFiles(screen, dsRoot);

    return {
      ...base,
      "README.md": buildReadmeMarkdown(t)
    };
  }
}