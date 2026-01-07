export type A2UIVersion = "0.2";

export type A2UIRoot = {
  version: A2UIVersion;
  meta: {
    generatedAt: string;
    source: "figma";
    fileKey?: string;
  };
  tree: A2UINode;
  diagnostics: A2UIDiagnostic[];
};

export type A2UIRef = {
  figmaNodeId?: string;
  componentKey?: string;
  styleId?: string;
  namePath?: string[];
};

export type A2UIDiagnostic = {
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  nodeId?: string;
  ref?: A2UIRef;
  suggestion?: {
    action: string;
    detail?: string;
  };
};

export type A2UILayout = {
  display?: "flex" | "block";
  direction?: "row" | "column";
  gap?: number;
  padding?: number[];
  width?: number | "fill" | "hug";
  height?: number | "fill" | "hug";
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
};

export type A2UIColor = { r: number; g: number; b: number; a: number };

export type A2UIStyle = {
  fills?: Array<{ type: "solid"; color: A2UIColor }>;
  strokes?: Array<{ type: "solid"; color: A2UIColor }>;
  strokeWeight?: number;
  radius?: number;
  shadow?: { x: number; y: number; blur: number; spread?: number; color: A2UIColor };
  typography?: {
    fontSize: number;
    fontWeight: number;
    lineHeight?: number;
    letterSpacing?: number;
    fontFamily?: string;
  };
};

export type A2UIBase = {
  id: string;
  type: string;
  name?: string;
  ref?: A2UIRef;
  layout?: A2UILayout;
  style?: A2UIStyle;
};

export type A2UIFrame = A2UIBase & {
  type: "frame";
  children: A2UINode[];
};

export type A2UIText = A2UIBase & {
  type: "text";
  text: string;
};

export type A2UIButton = A2UIBase & {
  type: "button";
  label: string;
  intent?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
};

export type A2UIInput = A2UIBase & {
  type: "input";
  placeholder?: string;
};

export type A2UIImage = A2UIBase & {
  type: "image";
  srcRef?: { figmaImageRef?: string };
};

export type A2UINode = A2UIFrame | A2UIText | A2UIButton | A2UIInput | A2UIImage;
