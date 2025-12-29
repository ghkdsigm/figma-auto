export type A2UIRoot = { version: "0.1"; meta: { generatedAt: string }; tree: A2UINode };
export type A2UINode = A2UIFrame | A2UIText | A2UIButton;
export type A2UIFrame = { id: string; type: "frame"; children: A2UINode[]; layout?: { direction?: "row"|"column"; gap?: number; padding?: number[] } };
export type A2UIText = { id: string; type: "text"; text: string };
export type A2UIButton = { id: string; type: "button"; label: string; variant?: string };
