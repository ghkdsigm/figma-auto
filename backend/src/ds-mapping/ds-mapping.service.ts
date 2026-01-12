/* backend/src/ds-mapping/ds-mapping.service.ts */
import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { A2UIRoot, A2UINode, A2UIColor, A2UIDiagnostic } from "../a2ui/spec";
import { DSRoot, DSNode } from "./spec";

type Policy = "STRICT" | "TOLERANT" | "MIXED" | "RAW";

type DesignSystem = {
  name: string;
  tokensVersion: string;
  tokens?: {
    spacing?: Record<string, number>;
    colors?: Record<string, { r: number; g: number; b: number }>;
    typography?: Record<string, { minSize: number; componentVariant: string }>;
  };
  components?: {
    BaseButton?: { intents: string[]; sizes: string[] };
    Typography?: { variants: string[] };
    BaseInput?: {};
    BaseSelect?: { sizes: string[] };
    BaseCheckbox?: { sizes: string[] };
    BaseRadio?: { sizes: string[] };
    BaseSwitch?: { sizes: string[] };
    DropdownMenu?: {};
    HamburgerButton?: {};
    MenuList?: {};
    ThumbnailCard?: {};
    Carousel?: {};
    CalendarInput?: {};
    RangeSlider?: {};
    ToggleButton?: { intents?: string[]; sizes?: string[] };
    Popup?: {};
    Loading?: { sizes?: string[] };
    Flag?: { intents?: string[] };
    Tabs?: {};
    AlertDialog?: {};
    UnsafeBox?: {};
  };
};

function loadDesignSystem(): DesignSystem {
  const p = path.join(process.cwd(), "design-system", "design-system.json");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}


function normalizeName(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, "");
}

function findFirstTextNode(n: any): string {
  if (!n) return "";
  if (n.type === "text") return String(n.text ?? n.label ?? "");
  const children = Array.isArray(n.children) ? n.children : [];
  for (const c of children) {
    const t = findFirstTextNode(c);
    if (t) return t;
  }
  return "";
}

function detectFrameComponent(n: any): { name: string; props?: Record<string, any> } | null {
  const nm = normalizeName(String(n?.name ?? ""));
  if (!nm) return null;

  if (/(select|combobox|dropdown)/.test(nm)) {
    const placeholder = findFirstTextNode(n) || "";
    return { name: "BaseSelect", props: { placeholder } };
  }

  if (/(checkbox|check)/.test(nm)) {
    const label = findFirstTextNode(n) || "";
    return { name: "BaseCheckbox", props: { label, checked: false } };
  }

  if (/(radio)/.test(nm)) {
    const label = findFirstTextNode(n) || "";
    return { name: "BaseRadio", props: { label, checked: false, name: "radio" } };
  }

  if (/(switch|toggle)/.test(nm)) {
    const label = findFirstTextNode(n) || "";
    return { name: "BaseSwitch", props: { label, checked: false } };
  }

  if (/(calendar|datepicker|date)/.test(nm)) {
    return { name: "CalendarInput", props: { value: "" } };
  }

  if (/(slider|range)/.test(nm)) {
    return { name: "RangeSlider", props: { min: 0, max: 100, value: 50 } };
  }

  if (/(hamburger)/.test(nm)) {
    return { name: "HamburgerButton", props: {} };
  }

  if (/(menu)/.test(nm)) {
    return { name: "MenuList", props: {} };
  }

  if (/(thumbnail|card)/.test(nm)) {
    return { name: "ThumbnailCard", props: { title: findFirstTextNode(n) || "" } };
  }

  if (/(carousel|swiper|slide)/.test(nm)) {
    return { name: "Carousel", props: {} };
  }

  if (/(togglebutton|toggle-btn|togglebutton|togglebutton|toggle\s*button)/.test(nm)) {
    const label = findFirstTextNode(n) || "";
    return { name: "ToggleButton", props: { label, checked: false, intent: "primary", size: "md" } };
  }

  if (/(popup|modal|dialog)/.test(nm)) {
    return { name: "Popup", props: { title: String(n?.name ?? "Popup") } };
  }

  if (/(loading|spinner)/.test(nm)) {
    const label = findFirstTextNode(n) || "";
    return { name: "Loading", props: { label, size: "md" } };
  }

  if (/(flag|badge|chip|tag)/.test(nm)) {
    const text = findFirstTextNode(n) || "";
    return { name: "Flag", props: { text, intent: "secondary" } };
  }

  if (/(tabs|tabbar|tab)/.test(nm)) {
    return { name: "Tabs", props: { modelValue: "", tabs: [] } };
  }

  if (/(alert|confirm)/.test(nm)) {
    return { name: "AlertDialog", props: { title: "알림", message: findFirstTextNode(n) || "" } };
  }

  return null;
}


function joinHints(n: any): string {
  const nm = String(n?.name ?? "");
  const path = Array.isArray(n?.ref?.namePath)
    ? n.ref.namePath.map((s: any) => String(s ?? "")).join("/")
    : "";
  return `${nm} ${path}`.trim();
}

function inferIntentFromFrame(n: any, ds: DesignSystem): "primary" | "secondary" | "danger" {
  const hints = normalizeName(joinHints(n));
  if (/(danger|delete|remove|red|error|warn)/.test(hints)) return "danger";
  if (/(secondary|outline|ghost|tertiary|cancel)/.test(hints)) return "secondary";

  const fill = n?.style?.fills?.[0]?.color;
  const tokens = ds.tokens?.colors;
  if (fill && tokens) {
    const primary = tokens.primary;
    const danger = tokens.danger;
    const surface = tokens.surface;

    const rgb = a2ToRgb255(fill);
    const dPrimary = primary ? rgbDistance(rgb, primary) : Infinity;
    const dDanger = danger ? rgbDistance(rgb, danger) : Infinity;
    const dSurface = surface ? rgbDistance(rgb, surface) : Infinity;

    const best = min3(dPrimary, dDanger, dSurface);
    if (best === dDanger) return "danger";
    if (best === dSurface) return "secondary";
  }

  return "primary";
}

function inferSizeFromFrame(n: any): "sm" | "md" | "lg" {
  const h = px(n?.layout?.height);
  if (h === undefined) return "md";
  if (h <= 32) return "sm";
  if (h <= 44) return "md";
  return "lg";
}

function inferStrictComponentFromFrame(
  n: any,
  ds: DesignSystem
): { name: string; props?: Record<string, any> } | null {
  const hints = normalizeName(joinHints(n));
  const label = findFirstTextNode(n) || "";

  if (/(button|btn)/.test(hints) && label) {
    return {
      name: "BaseButton",
      props: {
        intent: inferIntentFromFrame(n, ds),
        size: inferSizeFromFrame(n),
        label
      }
    };
  }

  if (/(input|textfield|text-field|textbox)/.test(hints)) {
    return { name: "BaseInput", props: { placeholder: label || "" } };
  }

  if (/(select|combobox|dropdown)/.test(hints)) {
    return { name: "BaseSelect", props: { placeholder: label || "" } };
  }

  if (/(checkbox|check)/.test(hints)) {
    return {
      name: "BaseCheckbox",
      props: { label: label || "", checked: false, size: inferSizeFromFrame(n) }
    };
  }

  if (/(radio)/.test(hints)) {
    return {
      name: "BaseRadio",
      props: { label: label || "", checked: false, name: "radio", size: inferSizeFromFrame(n) }
    };
  }

  if (/(switch|toggle)/.test(hints)) {
    return {
      name: "BaseSwitch",
      props: { label: label || "", checked: false, size: inferSizeFromFrame(n) }
    };
  }

  if (/(calendar|datepicker|date)/.test(hints)) {
    return { name: "CalendarInput", props: { value: "" } };
  }

  if (/(slider|range)/.test(hints)) {
    return { name: "RangeSlider", props: { min: 0, max: 100, value: 50 } };
  }

  if (/(hamburger)/.test(hints)) {
    return { name: "HamburgerButton", props: {} };
  }

  if (/(menu)/.test(hints)) {
    return { name: "MenuList", props: {} };
  }

  if (/(thumbnail|card)/.test(hints)) {
    return { name: "ThumbnailCard", props: { title: label || "" } };
  }

  if (/(carousel|swiper|slide)/.test(hints)) {
    return { name: "Carousel", props: {} };
  }

  if (/(togglebutton|toggle-btn|toggle\s*button)/.test(hints)) {
    return { name: "ToggleButton", props: { label: label || "", checked: false, intent: "primary", size: "md" } };
  }

  if (/(popup|modal|dialog)/.test(hints)) {
    return { name: "Popup", props: { title: String(n?.name ?? "Popup") } };
  }

  if (/(loading|spinner)/.test(hints)) {
    return { name: "Loading", props: { label: label || "", size: "md" } };
  }

  if (/(flag|badge|chip|tag)/.test(hints)) {
    return { name: "Flag", props: { text: label || "", intent: "secondary" } };
  }

  if (/(tabs|tabbar|tab)/.test(hints)) {
    return { name: "Tabs", props: { modelValue: "", tabs: [] } };
  }

  if (/(alert|confirm)/.test(hints)) {
    return { name: "AlertDialog", props: { title: "알림", message: label || "" } };
  }

  return null;
}

function min3(a: number, b: number, c: number) {
  return Math.min(a, b, c);
}

function rgbDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function a2ToRgb255(c: A2UIColor) {
  return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) };
}

function pickNearestSpacing(px: number, spacing: Record<string, number>) {
  const entries = Object.entries(spacing);
  if (!entries.length) return { token: undefined as string | undefined, distance: Infinity };
  let best = entries[0];
  let bestDist = Math.abs(px - best[1]);
  for (const e of entries.slice(1)) {
    const d = Math.abs(px - e[1]);
    if (d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return { token: best[0], distance: bestDist };
}

function pickNearestColorToken(c: A2UIColor, colors: Record<string, { r: number; g: number; b: number }>) {
  const entries = Object.entries(colors);
  if (!entries.length) return { token: undefined as string | undefined, distance: Infinity };
  const rgb = a2ToRgb255(c);
  let best = entries[0];
  let bestDist = rgbDistance(rgb, best[1]);
  for (const e of entries.slice(1)) {
    const d = rgbDistance(rgb, e[1]);
    if (d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return { token: best[0], distance: bestDist };
}

function pushDiag(list: A2UIDiagnostic[], diag: A2UIDiagnostic) {
  list.push(diag);
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function rgbaToHex(c: A2UIColor) {
  const r = Math.round(clamp01(c.r) * 255);
  const g = Math.round(clamp01(c.g) * 255);
  const b = Math.round(clamp01(c.b) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function px(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function clsPx(prefix: string, v: any): string | undefined {
  const n = px(v);
  if (n === undefined) return undefined;
  return `${prefix}-[${n}px]`;
}

function clsHexBg(fill: any): string | undefined {
  const c = fill?.color;
  if (!c) return undefined;
  return `bg-[${rgbaToHex(c)}]`;
}

function clsHexText(fill: any): string | undefined {
  const c = fill?.color;
  if (!c) return undefined;
  return `text-[${rgbaToHex(c)}]`;
}

function clsHexBorder(stroke: any): string | undefined {
  const c = stroke?.color;
  if (!c) return undefined;
  return `border-[${rgbaToHex(c)}]`;
}

function clsShadow(shadow: any): string | undefined {
  if (!shadow) return undefined;
  const x = px(shadow.x) ?? 0;
  const y = px(shadow.y) ?? 0;
  const blur = px(shadow.blur) ?? 0;
  const spread = px(shadow.spread) ?? 0;
  const c = shadow.color;
  if (!c) return undefined;

  const r = Math.round(clamp01(c.r) * 255);
  const g = Math.round(clamp01(c.g) * 255);
  const b = Math.round(clamp01(c.b) * 255);
  const a = clamp01(Number(c.a ?? 1));
  const rgba = `rgba(${r},${g},${b},${Number.isFinite(a) ? a.toFixed(3) : "1"})`;

  // Tailwind arbitrary values: spaces become underscores
  return `shadow-[${x}px_${y}px_${blur}px_${spread}px_${rgba}]`;
}

function mapTextVariant(fontSize: number, ds: DesignSystem) {
  const rules = ds.tokens?.typography ? Object.entries(ds.tokens.typography) : [];
  if (!rules.length) return "body";
  const sorted = rules.sort((a, b) => b[1].minSize - a[1].minSize);
  for (const [, v] of sorted) {
    if (fontSize >= v.minSize) return v.componentVariant;
  }
  return sorted[sorted.length - 1]?.[1].componentVariant ?? "body";
}

@Injectable()
export class DsMappingService {
  private ds = loadDesignSystem();

  map(root: A2UIRoot, policy: Policy = "TOLERANT"): DSRoot {
    const diagnostics: A2UIDiagnostic[] = [...(root.diagnostics || [])];

    const tree = this.mapNode(root.tree, policy, diagnostics);

    const out: DSRoot = {
      version: "0.1",
      meta: { generatedAt: new Date().toISOString(), policy, fileKey: root?.meta?.fileKey },
      tree,
      diagnostics
    };

    if (policy === "STRICT") {
      const hasError = diagnostics.some((d) => d.severity === "error");
      if (hasError) {
        const err = new Error("Design System mapping failed in STRICT mode");
        (err as any).diagnostics = diagnostics;
        throw err;
      }
    }

    return out;
  }

  private mapNode(
    n: A2UINode,
    policy: Policy,
    diagnostics: A2UIDiagnostic[],
    parentFlexDirection?: "row" | "column"
  ): DSNode {
    if (!n) {
      return { id: "nil", kind: "element", name: "div", children: [] };
    }

    if (n.type === "button") return this.mapButton(n, policy, diagnostics);
    if (n.type === "text") return this.mapText(n, policy, diagnostics);
    if (n.type === "input") return this.mapInput(n, policy, diagnostics);
    if (n.type === "image") return this.mapImage(n, policy, diagnostics, parentFlexDirection);
    if (n.type === "frame") return this.mapFrame(n, policy, diagnostics, parentFlexDirection);

    return this.unsafeFallback(n, policy, diagnostics, "UNSUPPORTED_NODE");
  }

  private mapButton(n: any, policy: Policy, diagnostics: A2UIDiagnostic[]): DSNode {
    if (policy === "RAW") {
      const intent = String(n.intent || "primary");
      const size = String(n.size || "md");

      const sizeCls =
        size === "sm" ? "px-3 py-1.5 text-sm" :
        size === "lg" ? "px-5 py-3 text-base" :
        "px-4 py-2 text-sm";

      // Prefer the original Figma TEXT fill color when available (n.style.fills comes from the TEXT node).
      const figmaTextFill = n.style?.fills?.[0];
      const figmaTextCls = clsHexText(figmaTextFill);

      const intentCls =
        intent === "secondary" ? "bg-white border border-[var(--ds-border)]" :
        intent === "danger" ? "bg-[var(--ds-danger)]" :
        "bg-[var(--ds-primary)]";

      const fallbackTextCls =
        intent === "secondary" ? "text-[var(--ds-fg)]" :
        "text-white";

      return {
        id: n.id,
        ref: n.ref,
        kind: "element",
        name: "button",
        classes: [
          "inline-flex items-center justify-center rounded-lg font-medium",
          sizeCls,
          intentCls,
          figmaTextCls || fallbackTextCls,
          "shadow-sm",
          "focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)] focus:ring-offset-2"
        ],
        children: [
          {
            id: `${n.id}_label`,
            kind: "element",
            name: "span",
            props: { text: String(n.label || "") },
            classes: [],
            children: [],
            ref: n.ref
          }
        ],
        props: {}
      };
    }

    const intent = n.intent || "primary";
    const size = n.size || "md";

    if (!["primary", "secondary", "danger"].includes(intent)) {
      pushDiag(diagnostics, {
        severity: policy === "STRICT" ? "error" : "warn",
        code: "DS_BUTTON_INTENT_UNKNOWN",
        message: `알 수 없는 버튼 intent: ${intent}`,
        nodeId: n.id,
        ref: n.ref,
        suggestion: { action: "map_to_nearest", detail: "primary로 폴백" }
      });
    }

    return {
      id: n.id,
      ref: n.ref,
      kind: "component",
      name: "BaseButton",
      props: { intent: ["primary", "secondary", "danger"].includes(intent) ? intent : "primary", size, label: n.label }
    };
  }

  private mapText(n: any, policy: Policy, diagnostics: A2UIDiagnostic[]): DSNode {
    if (policy === "RAW") {
      const classes: string[] = [];

      const t = n.style?.typography || {};
      const fontSize = px(t.fontSize) ?? 16;
      const fontWeight = px(t.fontWeight);
      const lineHeight = px(t.lineHeight);
      const letterSpacing = px(t.letterSpacing);
      const fontFamily = String(t.fontFamily || "").trim();

      classes.push(`text-[${fontSize}px]`);
      if (fontWeight !== undefined) classes.push(`font-[${fontWeight}]`);
      if (lineHeight !== undefined) classes.push(`leading-[${lineHeight}px]`);
      if (letterSpacing !== undefined) classes.push(`tracking-[${letterSpacing}px]`);
      if (fontFamily) {
        const safeFamily = fontFamily.replace(/"/g, "");
        classes.push(`font-["${safeFamily}"]`);
      }

      const fill = n.style?.fills?.[0];
      const textCls = clsHexText(fill);
      if (textCls) classes.push(textCls);

      return {
        id: n.id,
        ref: n.ref,
        kind: "element",
        name: "span",
        classes,
        props: { text: n.text }
      };
    }

    const fontSize = Number(n.style?.typography?.fontSize ?? 16);
    const variant = mapTextVariant(fontSize, this.ds);

    const props: Record<string, any> = { variant, text: n.text };

    const fill = n.style?.fills?.[0]?.color;
    if (fill && this.ds.tokens?.colors) {
      const { token, distance } = pickNearestColorToken(fill, this.ds.tokens.colors);
      if (token) {
        props.colorToken = token;
        if (distance > 18) {
          pushDiag(diagnostics, {
            severity: "warn",
            code: "DS_COLOR_APPROX",
            message: `텍스트 색상이 토큰과 유사 매칭됨: ${token} (distance=${distance.toFixed(1)})`,
            nodeId: n.id,
            ref: n.ref,
            suggestion: { action: "review_token", detail: "디자인 가이드 색상 토큰으로 정리 필요" }
          });
        }
      }
    }

    return {
      id: n.id,
      ref: n.ref,
      kind: "component",
      name: "Typography",
      props
    };
  }

  private mapInput(n: any, policy: Policy, diagnostics: A2UIDiagnostic[]): DSNode {
    return {
      id: n.id,
      ref: n.ref,
      kind: "component",
      name: "BaseInput",
      props: { placeholder: n.placeholder || "" }
    };
  }

  private mapImage(n: any, policy: Policy, diagnostics: A2UIDiagnostic[], parentFlexDirection?: "row" | "column"): DSNode {
    const nodeId = n?.ref?.figmaNodeId ? String(n.ref.figmaNodeId) : "";
    const placeholder = nodeId ? `__FIGMA_NODE__:${nodeId}` : "";

    // Preserve basic geometry in RAW mode so images don't collapse.
    const classes: string[] = ["object-cover"];
    const l = n.layout || {};
    if (l.width === "fill") {
      if (parentFlexDirection === "row") classes.push("flex-1", "min-w-0");
      else classes.push("w-full");
    }
    else {
      const wCls = clsPx("w", l.width);
      if (wCls) classes.push(wCls);
    }
    if (l.height === "fill") {
      if (parentFlexDirection === "column") classes.push("flex-1", "min-h-0");
      else classes.push("h-full");
    }
    else {
      const hCls = clsPx("h", l.height);
      if (hCls) classes.push(hCls);
    }
    const radius = px(n.style?.radius);
    if (radius !== undefined) classes.push(`rounded-[${radius}px]`);
    else classes.push("rounded");

    return {
      id: n.id,
      ref: n.ref,
      kind: "element",
      name: "img",
      props: { alt: n.name || "", src: placeholder },
      classes
    };
  }

  private mapFrame(n: any, policy: Policy, diagnostics: A2UIDiagnostic[], parentFlexDirection?: "row" | "column"): DSNode {
    if (policy === "STRICT") {
      const inferred = inferStrictComponentFromFrame(n, this.ds);
      if (inferred) {
        return {
          id: n.id,
          ref: n.ref,
          kind: "component",
          name: inferred.name,
          props: inferred.props || {},
          children: []
        };
      }
    }

    if (policy !== "RAW") {
  const detected = detectFrameComponent(n);
  if (detected) {
    return {
      id: n.id,
      ref: n.ref,
      kind: "component",
      name: detected.name,
      props: detected.props || {},
      children: Array.isArray(n.children)
        ? n.children.map((c: any) => this.mapNode(c, policy, diagnostics, n.layout?.direction))
        : []
    };
  }
}

    if (policy === "RAW") {
      const classes: string[] = [];
      const l = n.layout || {};

      if ((l.display || "flex") === "flex") {
        classes.push("flex");

        if (l.direction === "row") classes.push("flex-row");
        else if (l.direction === "column") classes.push("flex-col");
        else classes.push("flex-col");

        if (l.justify === "center") classes.push("justify-center");
        else if (l.justify === "end") classes.push("justify-end");
        else if (l.justify === "between") classes.push("justify-between");
        else classes.push("justify-start");

        if (l.align === "center") classes.push("items-center");
        else if (l.align === "end") classes.push("items-end");
        else if (l.align === "stretch") classes.push("items-stretch");
        else classes.push("items-start");

        const gapCls = clsPx("gap", l.gap);
        if (gapCls) classes.push(gapCls);
      }

      if (l.width === "fill") {
        if (parentFlexDirection === "row") classes.push("flex-1", "min-w-0");
        else classes.push("w-full");
      } else if (l.width === "hug") {
        classes.push("w-fit");
      } else {
        const wCls = clsPx("w", l.width);
        if (wCls) classes.push(wCls);
      }
      
      if (l.height === "fill") {
        if (parentFlexDirection === "column") classes.push("flex-1", "min-h-0");
        else classes.push("h-full");
      } else if (l.height === "hug") {
        classes.push("h-fit");
      } else {
        const hCls = clsPx("h", l.height);
        if (hCls) classes.push(hCls);
      }
      

      const p = Array.isArray(l.padding) ? l.padding : undefined;
      if (p && p.length === 4) {
        const names = ["pt", "pr", "pb", "pl"] as const;
        for (let i = 0; i < 4; i++) {
          const cls = clsPx(names[i], p[i]);
          if (cls) classes.push(cls);
        }
      }

      const fills = n.style?.fills || [];
      const bgCls = clsHexBg(fills[0]);
      if (bgCls) classes.push(bgCls);

      const radius = px(n.style?.radius);
      if (radius !== undefined) classes.push(`rounded-[${radius}px]`);

      const shadowCls = clsShadow(n.style?.shadow);
      if (shadowCls) classes.push(shadowCls);

      const strokes = n.style?.strokes || [];
      const strokeW = px(n.style?.strokeWeight);
      const borderColorCls = clsHexBorder(strokes[0]);

      const hasStroke = strokes.length > 0;
      if (hasStroke) {
        classes.push("border");
        if (borderColorCls) classes.push(borderColorCls);
        if (strokeW !== undefined && strokeW !== 1) {
          classes.push(`border-[${strokeW}px]`);
        }
      }

      const mappedChildren = (n.children || []).map((c: any) => this.mapNode(c, policy, diagnostics, l.direction));

      // Heuristic: if a "button-like" frame contains a single <button>, merge them.
      // This avoids nested div(button container) -> button, which can look like wrong sizing (e.g. 7:3).
      if (mappedChildren.length === 1) {
        const only = mappedChildren[0];
        if (only?.kind === "element" && only?.name === "button") {
          const childCls = Array.isArray(only.classes) ? only.classes : [];
          const mergedChildCls = childCls.filter((c: string) => {
            // Drop default button skin that conflicts with the frame's actual bg/border/padding.
            if (/^bg-/.test(c)) return false;
            if (/^px-/.test(c) || /^py-/.test(c)) return false;
            if (/^rounded/.test(c)) return false;
            if (/^shadow/.test(c)) return false;
            return true;
          });

          return {
            id: n.id,
            ref: n.ref,
            kind: "element",
            name: "button",
            props: only.props || {},
            classes: [...classes, ...mergedChildCls],
            children: only.children || []
          };
        }
      }

      return {
        id: n.id,
        ref: n.ref,
        kind: "element",
        name: "div",
        classes,
        children: mappedChildren
      };
    }

    const classes: string[] = [];

    const layout = n.layout;
    if (layout?.display === "flex") {
      classes.push("flex");
      if (layout.direction === "row") classes.push("flex-row");
      if (layout.direction === "column") classes.push("flex-col");
      if (layout.justify) {
        const m: any = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" };
        if (m[layout.justify]) classes.push(m[layout.justify]);
      }
      if (layout.align) {
        const m: any = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" };
        if (m[layout.align]) classes.push(m[layout.align]);
      }
      if (typeof layout.gap === "number") {
        const spacing = this.ds.tokens?.spacing || {};
        const { token, distance } = pickNearestSpacing(layout.gap, spacing);
        if (token) {
          classes.push(`gap-${token}`);
          if (distance > 2) {
            pushDiag(diagnostics, {
              severity: "warn",
              code: "DS_GAP_APPROX",
              message: `gap(${layout.gap}px)이 spacing 토큰(${token}=${spacing[token]}px)으로 근사 매핑됨`,
              nodeId: n.id,
              ref: n.ref,
              suggestion: { action: "review_spacing", detail: "디자인 토큰 정리 또는 gap 조정" }
            });
          }
        } else {
          classes.push(`gap-[${layout.gap}px]`);
        }
      }
      if (Array.isArray(layout.padding) && layout.padding.some((v: number) => v)) {
        const spacing = this.ds.tokens?.spacing || {};
        const [pt, pr, pb, pl] = layout.padding.map((v: any) => Number(v || 0));
        const p = [pt, pr, pb, pl];
        const tokens = p.map((v) => pickNearestSpacing(v, spacing).token);
        const allSame = tokens.every((t) => t && t === tokens[0]);
        if (allSame && tokens[0]) {
          classes.push(`p-${tokens[0]}`);
        } else {
          const cls: string[] = [];
          const names = ["pt", "pr", "pb", "pl"] as const;
          for (let i = 0; i < 4; i++) {
            const v = p[i];
            if (!v) continue;
            const { token } = pickNearestSpacing(v, spacing);
            cls.push(token ? `${names[i]}-${token}` : `${names[i]}-[${v}px]`);
          }
          classes.push(...cls);
        }
      }
    }

    return {
      id: n.id,
      ref: n.ref,
      kind: "element",
      name: "div",
      classes,
      children: (n.children || []).map((c: any) => this.mapNode(c, policy, diagnostics, layout?.direction))
    };
  }

  private unsafeFallback(n: any, policy: Policy, diagnostics: A2UIDiagnostic[], code: string): DSNode {
    pushDiag(diagnostics, {
      severity: policy === "STRICT" ? "error" : "warn",
      code,
      message: `Design System 매핑 불가: ${n.type}`,
      nodeId: n.id,
      ref: n.ref,
      suggestion: { action: "fallback_unsafe_box", detail: "UnsafeBox로 폴백하여 코드 생성은 유지" }
    });

    return {
      id: n.id,
      ref: n.ref,
      kind: "component",
      name: "UnsafeBox",
      props: { originalType: n.type, debugName: n.name || "" },
      children: n.children ? n.children.map((c: any) => this.mapNode(c, policy, diagnostics, n.layout?.direction)) : []
    };
  }
}
