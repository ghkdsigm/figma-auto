import { Injectable } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { A2UIRoot, A2UINode, A2UIDiagnostic, A2UIRef, A2UILayout, A2UIStyle, A2UIColor } from "./spec";

type FigmaNode = any;

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function figmaColorToA2(c: any): A2UIColor {
  return { r: clamp01(Number(c?.r ?? 0)), g: clamp01(Number(c?.g ?? 0)), b: clamp01(Number(c?.b ?? 0)), a: clamp01(Number(c?.a ?? 1)) };
}

function pickSolidPaints(paints: any[] | undefined): Array<{ type: "solid"; color: A2UIColor }> | undefined {
  const list = (paints || []).filter((p) => p && p.type === "SOLID" && p.visible !== false);
  if (!list.length) return undefined;
  return list.map((p) => ({ type: "solid" as const, color: figmaColorToA2(p.color ? { ...p.color, a: p.opacity ?? 1 } : { r: 0, g: 0, b: 0, a: p.opacity ?? 1 }) }));
}

function nodeRef(n: FigmaNode, namePath: string[]): A2UIRef {
  return {
    figmaNodeId: n?.id ? String(n.id) : undefined,
    componentKey: n?.componentId ? String(n.componentId) : n?.componentKey ? String(n.componentKey) : undefined,
    styleId: n?.styles ? JSON.stringify(n.styles) : undefined,
    namePath
  };
}

function nodeLayout(n: FigmaNode): A2UILayout | undefined {
  const layoutMode = n?.layoutMode;
  const hasAutoLayout = layoutMode && layoutMode !== "NONE";
  const padding = [
    Number(n?.paddingTop ?? 0),
    Number(n?.paddingRight ?? 0),
    Number(n?.paddingBottom ?? 0),
    Number(n?.paddingLeft ?? 0)
  ];
  const gap = Number(n?.itemSpacing ?? 0);

  const width = n?.layoutSizingHorizontal === "FILL" ? "fill" : n?.layoutSizingHorizontal === "HUG" ? "hug" : (n?.absoluteBoundingBox?.width ? Number(n.absoluteBoundingBox.width) : undefined);
  const height = n?.layoutSizingVertical === "FILL" ? "fill" : n?.layoutSizingVertical === "HUG" ? "hug" : (n?.absoluteBoundingBox?.height ? Number(n.absoluteBoundingBox.height) : undefined);

  if (!hasAutoLayout && !padding.some((v) => v) && !gap && width === undefined && height === undefined) return undefined;

  const justify = n?.primaryAxisAlignItems === "SPACE_BETWEEN" ? "between"
    : n?.primaryAxisAlignItems === "CENTER" ? "center"
    : n?.primaryAxisAlignItems === "MAX" ? "end"
    : n?.primaryAxisAlignItems === "MIN" ? "start"
    : undefined;

  const align = n?.counterAxisAlignItems === "CENTER" ? "center"
    : n?.counterAxisAlignItems === "MAX" ? "end"
    : n?.counterAxisAlignItems === "MIN" ? "start"
    : n?.counterAxisAlignItems === "STRETCH" ? "stretch"
    : undefined;

  return {
    display: hasAutoLayout ? "flex" : undefined,
    direction: layoutMode === "HORIZONTAL" ? "row" : layoutMode === "VERTICAL" ? "column" : undefined,
    gap: Number.isFinite(gap) ? gap : undefined,
    padding: padding.some((v) => v) ? padding : undefined,
    width: width as any,
    height: height as any,
    justify,
    align
  };
}

function nodeStyle(n: FigmaNode): A2UIStyle | undefined {
  const fills = pickSolidPaints(n?.fills);
  const strokes = pickSolidPaints(n?.strokes);
  const strokeWeight = n?.strokeWeight !== undefined ? Number(n.strokeWeight) : undefined;

  const radius = n?.cornerRadius !== undefined ? Number(n.cornerRadius)
    : (Array.isArray(n?.rectangleCornerRadii) ? Number(n.rectangleCornerRadii?.[0] ?? 0) : undefined);

  const typography = n?.style ? {
    fontSize: Number(n.style.fontSize ?? 0),
    fontWeight: Number(n.style.fontWeight ?? 400),
    lineHeight: n.style.lineHeightPx !== undefined ? Number(n.style.lineHeightPx) : undefined,
    letterSpacing: n.style.letterSpacing !== undefined ? Number(n.style.letterSpacing) : undefined,
    fontFamily: n.style.fontFamily ? String(n.style.fontFamily) : undefined
  } : undefined;

  if (!fills && !strokes && strokeWeight === undefined && (radius === undefined || Number.isNaN(radius)) && !typography) return undefined;

  return {
    fills,
    strokes,
    strokeWeight: Number.isFinite(strokeWeight as any) ? strokeWeight : undefined,
    radius: Number.isFinite(radius as any) ? radius : undefined,
    typography: typography && Number.isFinite(typography.fontSize) && typography.fontSize > 0 ? typography : undefined
  };
}

function isButtonText(txt: string) {
  const t = txt.trim();
  if (!t) return false;
  const exact = ["확인", "저장", "취소", "로그인", "다운로드", "삭제", "추가", "등록"];
  if (exact.includes(t)) return true;
  if (t.length <= 12 && /^(확인|저장|취소|로그인|다운로드)/.test(t)) return true;
  return false;
}

function fromNode(n: FigmaNode, namePath: string[], diagnostics: A2UIDiagnostic[]): A2UINode | null {
  if (!n) return null;
  const type = String(n.type || "");
  const id = String(n.id || uuid());
  const base = {
    id,
    name: n.name ? String(n.name) : undefined,
    ref: nodeRef(n, namePath),
    layout: nodeLayout(n),
    style: nodeStyle(n)
  };

  if (["DOCUMENT", "CANVAS", "FRAME", "COMPONENT", "INSTANCE", "GROUP"].includes(type)) {
    const children = (n.children || [])
      .map((c: any) => fromNode(c, [...namePath, String(c?.name ?? c?.type ?? "node")], diagnostics))
      .filter(Boolean) as A2UINode[];

    return { ...base, type: "frame", children };
  }

  if (type === "TEXT") {
    const txt = String(n.characters || "");
    if (isButtonText(txt)) {
      diagnostics.push({
        severity: "info",
        code: "HEURISTIC_BUTTON_TEXT",
        message: `TEXT 노드를 버튼으로 추정: "${txt}"`,
        nodeId: id,
        ref: base.ref,
        suggestion: { action: "consider_component_mapping", detail: "Design System 버튼 컴포넌트로 매핑 가능" }
      });
      return { ...base, type: "button", label: txt, intent: "primary", size: "md" };
    }
    return { ...base, type: "text", text: txt };
  }

  if (type === "RECTANGLE" || type === "VECTOR" || type === "STAR" || type === "ELLIPSE") {
    const fills = base.style?.fills;
    const looksLikeImage = (n.fills || []).some((p: any) => p?.type === "IMAGE");
    if (looksLikeImage) {
      return { ...base, type: "image", srcRef: n.fills?.[0]?.imageRef ? { figmaImageRef: String(n.fills[0].imageRef) } : undefined };
    }
    if (fills && fills.length) {
      return { ...base, type: "frame", children: [] };
    }
    return null;
  }

  return null;
}

@Injectable()
export class A2uiService {
  fromFigma(fileJson: any, fileKey?: string): A2UIRoot {
    const diagnostics: A2UIDiagnostic[] = [];
    const root = fromNode(fileJson?.document, [String(fileJson?.document?.name ?? "document")], diagnostics) || {
      id: uuid(),
      type: "frame",
      children: []
    };

    return {
      version: "0.2",
      meta: { generatedAt: new Date().toISOString(), source: "figma", fileKey },
      tree: root as any,
      diagnostics
    };
  }
}
