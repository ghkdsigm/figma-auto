import { Injectable } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { A2UIRoot, A2UINode, A2UIDiagnostic, A2UIRef, A2UILayout, A2UIStyle, A2UIColor } from "./spec";

type FigmaNode = any;

type Policy = "STRICT" | "TOLERANT" | "MIXED" | "RAW";

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function figmaColorToA2(c: any): A2UIColor {
  return {
    r: clamp01(Number(c?.r ?? 0)),
    g: clamp01(Number(c?.g ?? 0)),
    b: clamp01(Number(c?.b ?? 0)),
    a: clamp01(Number(c?.a ?? 1))
  };
}

function pickSolidPaints(paints: any[] | undefined): Array<{ type: "solid"; color: A2UIColor }> | undefined {
  const list = (paints || []).filter((p) => p && p.type === "SOLID" && p.visible !== false);
  if (!list.length) return undefined;
  return list.map((p) => ({
    type: "solid" as const,
    color: figmaColorToA2(
      p.color ? { ...p.color, a: p.opacity ?? 1 } : { r: 0, g: 0, b: 0, a: p.opacity ?? 1 }
    )
  }));
}

function nodeRef(n: FigmaNode, namePath: string[]): A2UIRef {
  return {
    figmaNodeId: n?.id ? String(n.id) : undefined,
    componentKey: n?.componentId ? String(n.componentId) : n?.componentKey ? String(n.componentKey) : undefined,
    styleId: n?.styles ? JSON.stringify(n.styles) : undefined,
    namePath
  };
}

function readAutoLayoutSource(n: FigmaNode) {
  const al = n?.autoLayout && typeof n.autoLayout === "object" ? n.autoLayout : undefined;

  const layoutMode = al?.layoutMode ?? n?.layoutMode;
  const primaryAxisAlignItems = al?.primaryAxisAlignItems ?? n?.primaryAxisAlignItems;
  const counterAxisAlignItems = al?.counterAxisAlignItems ?? n?.counterAxisAlignItems;

  const primaryAxisSizingMode = al?.primaryAxisSizingMode ?? n?.primaryAxisSizingMode;
  const counterAxisSizingMode = al?.counterAxisSizingMode ?? n?.counterAxisSizingMode;

  const paddingTop = al?.paddingTop ?? n?.paddingTop ?? 0;
  const paddingRight = al?.paddingRight ?? n?.paddingRight ?? 0;
  const paddingBottom = al?.paddingBottom ?? n?.paddingBottom ?? 0;
  const paddingLeft = al?.paddingLeft ?? n?.paddingLeft ?? 0;

  const itemSpacing = al?.itemSpacing ?? n?.itemSpacing ?? 0;

  const layoutSizingHorizontal = n?.layoutSizingHorizontal ?? al?.layoutSizingHorizontal;
  const layoutSizingVertical = n?.layoutSizingVertical ?? al?.layoutSizingVertical;

  return {
    layoutMode,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    primaryAxisSizingMode,
    counterAxisSizingMode,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    itemSpacing,
    layoutSizingHorizontal,
    layoutSizingVertical
  };
}

function nodeLayout(n: FigmaNode): A2UILayout | undefined {
  const al = readAutoLayoutSource(n);

  const layoutMode = al.layoutMode;
  const hasAutoLayout = Boolean(layoutMode && layoutMode !== "NONE");

  const padding = [
    Number(al.paddingTop ?? 0),
    Number(al.paddingRight ?? 0),
    Number(al.paddingBottom ?? 0),
    Number(al.paddingLeft ?? 0)
  ];

  const gap = Number(al.itemSpacing ?? 0);

  const absW =
    n?.width !== undefined ? Number(n.width) :
    n?.absoluteBoundingBox?.width !== undefined ? Number(n.absoluteBoundingBox.width) :
    undefined;

  const absH =
    n?.height !== undefined ? Number(n.height) :
    n?.absoluteBoundingBox?.height !== undefined ? Number(n.absoluteBoundingBox.height) :
    undefined;

  const sizingH: string | undefined = al.layoutSizingHorizontal ?? al.primaryAxisSizingMode;
  const sizingV: string | undefined = al.layoutSizingVertical ?? al.counterAxisSizingMode;

  // For code generation, favor the absolute bounding box size for visual fidelity.
  // We still keep "fill" so that parent-driven layouts can stretch when needed.
  const width: number | "fill" | "hug" | undefined =
    sizingH === "FILL" ? "fill" :
    absW;

  const height: number | "fill" | "hug" | undefined =
    sizingV === "FILL" ? "fill" :
    absH;

  if (!hasAutoLayout && !padding.some((v) => v) && !gap && width === undefined && height === undefined) {
    return undefined;
  }

  const justify =
    al.primaryAxisAlignItems === "SPACE_BETWEEN" ? "between" :
    al.primaryAxisAlignItems === "CENTER" ? "center" :
    al.primaryAxisAlignItems === "MAX" ? "end" :
    al.primaryAxisAlignItems === "MIN" ? "start" :
    undefined;

  const align =
    al.counterAxisAlignItems === "CENTER" ? "center" :
    al.counterAxisAlignItems === "MAX" ? "end" :
    al.counterAxisAlignItems === "MIN" ? "start" :
    al.counterAxisAlignItems === "STRETCH" ? "stretch" :
    undefined;

  const direction =
    layoutMode === "HORIZONTAL" ? "row" :
    layoutMode === "VERTICAL" ? "column" :
    undefined;

  return {
    display: hasAutoLayout ? "flex" : undefined,
    direction,
    gap: gap || undefined,
    padding: padding.some((v) => v) ? padding : undefined,
    width,
    height,
    justify,
    align
  };
}

function nodeStyle(n: FigmaNode): A2UIStyle | undefined {
  const fills = pickSolidPaints(n?.fills);
  const strokes = pickSolidPaints(n?.strokes);
  const strokeWeight = n?.strokeWeight !== undefined ? Number(n.strokeWeight) : undefined;

  const radius =
    n?.cornerRadius !== undefined ? Number(n.cornerRadius)
    : (Array.isArray(n?.rectangleCornerRadii) ? Number(n.rectangleCornerRadii?.[0] ?? 0) : undefined);

  const textStyle = n?.text;

  const typography = textStyle ? {
    fontSize: Number(textStyle.fontSize ?? 0),
    fontWeight: (() => {
      const style = String(textStyle?.fontName?.style ?? "").toLowerCase();
      if (style.includes("thin")) return 100;
      if (style.includes("extralight") || style.includes("extra light")) return 200;
      if (style.includes("light")) return 300;
      if (style.includes("regular") || style.includes("normal")) return 400;
      if (style.includes("medium")) return 500;
      if (style.includes("semibold") || style.includes("semi bold")) return 600;
      if (style.includes("bold")) return 700;
      if (style.includes("extrabold") || style.includes("extra bold")) return 800;
      if (style.includes("black")) return 900;
      return 400;
    })(),
    lineHeight: textStyle?.lineHeight?.unit === "PIXELS" ? Number(textStyle.lineHeight.value) : undefined,
    letterSpacing: textStyle?.letterSpacing?.unit === "PIXELS" ? Number(textStyle.letterSpacing.value) : 0,
    fontFamily: textStyle?.fontName?.family ? String(textStyle.fontName.family) : undefined
  } : (n?.style ? {
    fontSize: Number(n.style.fontSize ?? 0),
    fontWeight: Number(n.style.fontWeight ?? 400),
    lineHeight: n.style.lineHeightPx !== undefined ? Number(n.style.lineHeightPx) : undefined,
    letterSpacing: n.style.letterSpacing !== undefined ? Number(n.style.letterSpacing) : undefined,
    fontFamily: n.style.fontFamily ? String(n.style.fontFamily) : undefined
  } : undefined);

const effects = Array.isArray((n as any)?.effects) ? (n as any).effects : [];
const drop = effects.find((e: any) => e?.type === "DROP_SHADOW" && e?.visible !== false);
const shadow = drop ? (() => {
  const ox = Number(drop?.offset?.x ?? 0);
  const oy = Number(drop?.offset?.y ?? 0);
  const blur = Number(drop?.radius ?? 0);
  const spread = Number(drop?.spread ?? 0);
  const c = drop?.color;
  const a = c?.a !== undefined ? Number(c.a) : 0.2;
  const r = c?.r !== undefined ? Math.round(Number(c.r) * 255) : 0;
  const g = c?.g !== undefined ? Math.round(Number(c.g) * 255) : 0;
  const b = c?.b !== undefined ? Math.round(Number(c.b) * 255) : 0;
  return `${ox}px ${oy}px ${blur}px ${spread}px rgba(${r},${g},${b},${a})`;
})() : undefined;

  if (!fills && !strokes && strokeWeight === undefined && !shadow && (radius === undefined || Number.isNaN(radius)) && !typography) return undefined;

  return {
    fills,
    strokes,
    shadow,
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

function fromNode(n: FigmaNode, namePath: string[], diagnostics: A2UIDiagnostic[], opts?: { policy?: Policy; parentExportId?: string }): A2UINode | null {
  if (!n) return null;

  const type = String(n.type || "");
  const id = String(n.id || uuid());
  const parentExportId = opts?.parentExportId;
  const exportOwnerId = id.startsWith("I") && id.includes(";") && parentExportId ? parentExportId : id;

  const base = {
    id,
    name: n.name ? String(n.name) : undefined,
    ref: nodeRef(n, namePath),
    layout: nodeLayout(n),
    style: nodeStyle(n)
  };

  if (base.ref) base.ref.figmaNodeId = exportOwnerId;


  if (["DOCUMENT", "CANVAS", "FRAME", "COMPONENT", "INSTANCE", "GROUP"].includes(type)) {
    const children = (n.children || [])
      .map((c: any) => fromNode(c, [...namePath, String(c?.name ?? c?.type ?? "node")], diagnostics, { policy: opts?.policy, parentExportId: exportOwnerId }))
      .filter(Boolean) as A2UINode[];

    return { ...base, type: "frame", children };
  }

  if (type === "TEXT") {
    const txt = String(n.characters || n.text?.characters || "");
    if ((opts?.policy ?? "RAW") !== "RAW" && isButtonText(txt)) {
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

// ICON_ONLY_INSTANCE:
// If a container consists only of vector-like children, export the container once as an image.
if (Array.isArray(n?.children) && n.children.length > 0) {
  const vectorLike = ["VECTOR", "STAR", "ELLIPSE"];
  const allVectorLike = n.children.every((c: any) => vectorLike.includes(String(c?.type || "")));
  if (allVectorLike) {
    return {
      ...base,
      type: "image",
      ref: { ...base.ref, figmaNodeId: exportOwnerId },
      layout: base.layout
    };
  }
}

  if (type === "VECTOR" || type === "STAR" || type === "ELLIPSE") {
    // Export JSON Pro로 들어온 VECTOR 계열은 실제로 아이콘/패스가 대부분이며,
    // RAW 정책에서도 그대로 보이도록 렌더링 이미지로 취급한다.
    return {
      ...base,
      type: "image",
      // Instance 내부 벡터(I...;...)는 Images API에서 직접 export가 안 되는 경우가 많다.
      // 이때는 상위 exportOwnerId(대개 INSTANCE/COMPONENT id)로 export한다.
      ref: { ...base.ref, figmaNodeId: exportOwnerId }
    };
  }

if (type === "LINE") {
  const stroke = pickSolidPaints(n?.strokes)?.[0];
  const strokeWeight = n?.strokeWeight !== undefined ? Number(n.strokeWeight) : 1;
  const fills = stroke ? [{ type: "solid", color: stroke.color }] : undefined;

  return {
    ...base,
    type: "frame",
    style: {
      ...base.style,
      fills,
      strokes: undefined,
      strokeWeight: undefined
    },
    layout: {
      ...base.layout,
      height: Math.max(1, Math.round(strokeWeight || 1))
    },
    children: []
  };
}

if (type === "RECTANGLE") {
    const fills = base.style?.fills;
    const strokes = base.style?.strokes;

    const looksLikeImage = (n.fills || []).some((p: any) => p?.type === "IMAGE");
    if (looksLikeImage) {
      return {
        ...base,
        type: "image",
        srcRef: n.fills?.[0]?.imageRef ? { figmaImageRef: String(n.fills[0].imageRef) } : undefined
      };
    }
    const hasFill = Boolean(fills && fills.length);
    const hasStroke = Boolean(strokes && strokes.length);
    if (hasFill || hasStroke) {
      return { ...base, type: "frame", children: [] };
    }
    return null;
  }

  return null;
}

function extractExportJsonProTrees(fileJson: any): Array<{ name: string; tree: any }> {
  const exportsArr = fileJson?.payload?.exports;
  if (!Array.isArray(exportsArr) || !exportsArr.length) return [];
  return exportsArr
    .map((e: any) => ({
      name: String(e?.name ?? e?.id ?? "export"),
      tree: e?.tree
    }))
    .filter((x: any) => x.tree);
}

@Injectable()
export class A2uiService {
  fromFigma(fileJson: any, fileKey?: string, policy: Policy = "RAW"): A2UIRoot {
    const diagnostics: A2UIDiagnostic[] = [];

    const exportTrees = extractExportJsonProTrees(fileJson);

    let rootNode: A2UINode | null = null;

    if (exportTrees.length) {
      const children = exportTrees
        .map((ex) => fromNode(ex.tree, [ex.name], diagnostics, { policy, parentExportId: String(ex?.tree?.id || "") }))
        .filter(Boolean) as A2UINode[];

      rootNode = {
        id: uuid(),
        type: "frame",
        name: "exports",
        ref: { figmaNodeId: undefined, componentKey: undefined, styleId: undefined, namePath: ["exports"] },
        children
      } as any;
    } else {
      const doc = fileJson?.document ?? fileJson?.payload?.tree ?? fileJson?.tree;
      const docName = String(fileJson?.document?.name ?? fileJson?.payload?.meta?.pageName ?? "document");

      rootNode =
        fromNode(doc, [docName], diagnostics, { policy, parentExportId: String(doc?.id || "") })
        || ({
          id: uuid(),
          type: "frame",
          children: []
        } as any);
    }

    return {
      version: "0.2",
      meta: { generatedAt: new Date().toISOString(), source: "figma", fileKey },
      tree: rootNode as any,
      diagnostics
    };
  }
}