/* backend/src/codegen/codegen.service.ts */
import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import archiver = require("archiver");
import { v4 as uuid } from "uuid";
import type { DSRoot, DSNode } from "../ds-mapping/spec";
import axios from "axios";
import { McpClient } from "../mcp/mcp.client";

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
  // Cursor/LLM에게 반복 설명을 줄이기 위한 최소 지침 (의도적으로 짧게 유지)
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
  // object/array는 예시로 넣으면 너무 커지는 경우가 많아서 스킵
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
    // dist 실행 시 cwd가 달라질 수 있어 __dirname 기반도 시도
    path.resolve(__dirname, "../../design-system/design-system.json"),
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
  const out: Record<string, Record<string, { typeSet: Set<string>; examples: Array<string | number | boolean | null> }>> = {};

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
        ...(v.examples.length ? { examples: v.examples } : {}),
      };
    }
  }
  return finalized;
}

function parseDefinePropsSpec(vueSource: string): Record<string, ManifestPropSummary> {
  // 매우 단순 파서: defineProps<{ ... }>() 형태만 지원한다 (현재 codegen 템플릿에 충분)
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
    // optional 여부는 manifest에 굳이 넣지 않고 타입 문자열로만 요약
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
        ...((v.examples || []) as Array<string | number | boolean | null>),
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

  const keyOf = (tag: string, classes: string[]) =>
    `${tag}::${classes.filter(Boolean).slice().sort().join(" ")}`;

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
          exampleClasses: classes,
        };
      }
      if (hasRounded && (hasBg || hasBorder)) {
        return {
          candidate: "BaseButton",
          confidence: "medium",
          reason: "button 태그 + rounded + (bg 또는 border) 조합(버튼 후보)",
          exampleTag: tag,
          exampleClasses: classes,
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
          exampleClasses: classes,
        };
      }
      if (hasRounded && hasBorder) {
        return {
          candidate: "BaseInput",
          confidence: "medium",
          reason: "input 태그 + border/rounded 조합(인풋 후보)",
          exampleTag: tag,
          exampleClasses: classes,
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
    // 매우 보수적으로: 같은 컨테이너(children)에 "텍스트 라벨" + "input"이 같이 있으면 FormField 후보로 본다.
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

    // confidence는 레이아웃 힌트가 있으면 high, 아니면 medium
    const confidence: "high" | "medium" = hasFlexCol || hasGap ? "high" : "medium";

    return {
      candidate: "FormField",
      confidence,
      reason:
        confidence === "high"
          ? "컨테이너(div) 내부에 라벨 텍스트 1개 + input 1개가 있고, flex-col/gap 힌트가 있어 FormField 구조 가능성 높음"
          : "컨테이너(div) 내부에 라벨 텍스트 1개 + input 1개가 있어 FormField 후보",
      exampleTag: tag,
      exampleClasses: classes,
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

    // FormField 후보는 컨테이너 패턴에서 추출
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

  return all
    .sort((a, b) => score(b) - score(a))
    .slice(0, 8);
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
      namePath: Array.isArray(d?.ref?.namePath) ? d.ref!.namePath!.join("/") : undefined,
    }));

  const manifest: Manifest = {
    schemaVersion: "0.1",
    generatedAt: new Date().toISOString(),
    policy: String(dsRoot?.meta?.policy || "RAW"),
    target: String(target || "nuxt"),
    ...(ds
      ? { designSystem: { name: ds?.name, tokensVersion: ds?.tokensVersion, pathTried } }
      : { designSystem: { pathTried } }),
    commonComponents,
    generatedComponents,
    componentPropsSummary,
    cursorGuidance: {
      uiChangeForbidden: true,
      preferComponents: commonComponents,
      fallbackRule: "치환 확신이 없거나 UI가 바뀔 위험이 있으면 기존 div/구조 유지(치환 강행 금지)",
      note: "RAW 출력물은 '날코딩'이므로, components/의 공통 컴포넌트를 최대한 임포트/치환하되 UI 변경은 금지한다.",
    },
    ...(dsRoot?.meta?.policy === "RAW" ? { rawCandidatePatterns: collectRawCandidatePatterns(dsRoot) } : {}),
    ...(diagnosticsSample.length ? { hints: { diagnosticsSample } } : {}),
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

  if (
    n.kind === "element" &&
    n.props &&
    typeof (n.props as any).text === "string" &&
    (!n.children || !n.children.length)
  ) {
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
    return `<BaseSelect${cls}${props}>${(n.children || []).map(renderNode).join("\n")}</BaseSelect>`;
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
    const children = (n.children || []).map(renderNode).join("\n");
    return `<DropdownMenu${cls}${props}>${children ? "\n" + children + "\n" : ""}</DropdownMenu>`;
  }

  if (tag === "HamburgerButton") {
    return `<HamburgerButton${cls}${props} />`;
  }

  if (tag === "MenuList") {
    const children = (n.children || []).map(renderNode).join("\n");
    return `<MenuList${cls}${props}>${children ? "\n" + children + "\n" : ""}</MenuList>`;
  }

  if (tag === "ThumbnailCard") {
    const title = String(n.props?.title ?? "");
    const restProps = { ...(n.props || {}) };
    delete (restProps as any).title;
    const p = renderProps(restProps);
    const children = (n.children || []).map(renderNode).join("\n");
    return `<ThumbnailCard${cls}${p} title="${escapeAttr(title)}">${children ? "\n" + children + "\n" : ""}</ThumbnailCard>`;
  }

  if (tag === "Carousel") {
    const children = (n.children || []).map(renderNode).join("\n");
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
    const children = (n.children || []).map(renderNode).join("\n");
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
    const children = (n.children || []).map(renderNode).join("\n");
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
    const children = (n.children || []).map(renderNode).join("\n");
    return `<UnsafeBox${cls}${props}>${children ? "\n" + children + "\n" : ""}</UnsafeBox>`;
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

  async resolveFigmaAssetUrls(dsRoot: DSRoot): Promise<void> {
    const fileKey = dsRoot?.meta?.fileKey;
    if (!fileKey) return;

    const ids = new Set<string>();
    this.collectImageNodeIds(dsRoot.tree, ids);
    if (ids.size === 0) return;

    const idList = Array.from(ids);
    const chunks: string[][] = [];
    for (let i = 0; i < idList.length; i += 50) chunks.push(idList.slice(i, i + 50));

    const idToUrl = new Map<string, string>();
    for (const chunk of chunks) {
      try {
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
      } catch {
        // ignore chunk failures
      }
    }

    const rewrite = (node: DSNode) => {
      if (!node) return;
      if (node.kind === "element" && node.name === "img") {
        const nodeId = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
        const p = node.props || {};
        const src = String((p as any).src || "");
        const next = nodeId ? idToUrl.get(nodeId) : undefined;
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

    const rewrite = (node: DSNode) => {
      if (!node) return;
      if (node.kind === "element" && node.name === "img") {
        const nodeId = node?.ref?.figmaNodeId ? String(node.ref.figmaNodeId) : "";
        const safe = nodeId.replace(/[^a-zA-Z0-9._-]/g, "_");
        const p = node.props || {};
        const src = String((p as any).src || "");
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
  
    await this.resolveFigmaAssets(dsRoot, dir);
  
    const screen = renderNode(dsRoot.tree);
    const t = String(target || "nuxt").toLowerCase();
  
    let files: Record<string, string> = t === "vue" ? viteFiles(screen, dsRoot) : nuxtFiles(screen, dsRoot);
  
    files = {
      ...files,
      "README.md": buildReadmeMarkdown(t),
      "README_refactor.md": buildReadmeRefactorMarkdown(),
      "manifest.json": buildManifestJson(dsRoot, t),
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
    const screen = renderNode(dsRoot.tree);
    const t = String(target || "nuxt").toLowerCase();
  
    const base = t === "vue" ? viteFiles(screen, dsRoot) : nuxtFiles(screen, dsRoot);
  
    return {
      ...base,
      "README.md": buildReadmeMarkdown(t),
    };
  }  
}
