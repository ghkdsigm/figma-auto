import type { A2UIDiagnostic, A2UIRef } from "../a2ui/spec";

export type DSRoot = {
  version: "0.1";
  meta: {
    generatedAt: string;
    policy: "STRICT" | "TOLERANT" | "MIXED" | "RAW";
    fileKey?: string;
  };
  tree: DSNode;
  diagnostics: A2UIDiagnostic[];
};

export type DSNode = {
  id: string;
  ref?: A2UIRef;
  kind: "component" | "element";
  name: string;
  props?: Record<string, any>;
  classes?: string[];
  children?: DSNode[];
  diagnostics?: A2UIDiagnostic[];
};
