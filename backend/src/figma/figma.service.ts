// src/figma/figma.service.ts
import { Injectable } from "@nestjs/common";
import { McpClient } from "../mcp/mcp.client";

@Injectable()
export class FigmaService {
  constructor(private readonly mcp: McpClient) {}

  // Toolserver (and our Zod schema) currently clamps depth to <= 6.
  // Deeply nested frames (common for selects/checkbox groups) can still be truncated.
  // We work around that by recursively expanding "empty" container nodes via additional getNodes calls.
  private readonly defaultDepth = 6;
  private readonly minDepth = 1;
  private readonly maxDepth = 6;

  // How many recursive expansion passes to attempt.
  // 0 = no expansion, 1~3 is usually enough for real-world Figma nesting.
  private readonly expandRounds = Number(process.env.FIGMA_EXPAND_ROUNDS ?? 2);

  // Safety cap: maximum number of node ids we will expand per import.
  private readonly expandMaxNodes = Number(process.env.FIGMA_EXPAND_MAX_NODES ?? 200);

  private normalizeDepth(depth?: number): number {
    const raw = typeof depth === "number" && Number.isFinite(depth) ? Math.trunc(depth) : this.defaultDepth;
    return Math.min(this.maxDepth, Math.max(this.minDepth, raw));
  }

  private isExpandableContainer(n: any): boolean {
    const t = String(n?.type ?? "");
    if (!["FRAME", "GROUP", "COMPONENT", "INSTANCE"].includes(t)) return false;
    const children = n?.children;
    if (!Array.isArray(children)) return false;
    return children.length === 0;
  }

  private collectExpandableIds(root: any): string[] {
    const out: string[] = [];
    const stack: any[] = [root];

    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;

      if (this.isExpandableContainer(n) && typeof n.id === "string" && n.id) {
        out.push(n.id);
      }

      const children = n?.children;
      if (Array.isArray(children) && children.length) {
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
    }

    return out;
  }

  private replaceNodeById(root: any, id: string, nextNode: any): boolean {
    if (!root) return false;
    const stack: any[] = [root];

    while (stack.length) {
      const n = stack.pop();
      const children = n?.children;
      if (!Array.isArray(children) || !children.length) continue;

      for (let i = 0; i < children.length; i += 1) {
        const c = children[i];
        if (c?.id === id) {
          children[i] = nextNode;
          return true;
        }
        stack.push(c);
      }
    }

    return false;
  }

  private async expandDeepNodes(fileKey: string, documentRoot: any, depth: number): Promise<any> {
    if (!documentRoot || this.expandRounds <= 0) return documentRoot;

    const visited = new Set<string>();
    let expandedCount = 0;

    for (let round = 0; round < this.expandRounds; round += 1) {
      const candidates = this.collectExpandableIds(documentRoot)
        .filter((id) => !visited.has(id));

      if (!candidates.length) break;

      // Chunk to avoid very large requests.
      const chunkSize = 50;
      for (let i = 0; i < candidates.length; i += chunkSize) {
        const chunk = candidates.slice(i, i + chunkSize);
        chunk.forEach((id) => visited.add(id));

        const res = await this.mcp.invokeTool("figma.getNodes", {
          fileKey,
          ids: chunk,
          depth
        });

        for (const id of chunk) {
          const doc = res?.nodes?.[id]?.document;
          if (!doc) continue;

          // Replace the truncated container node with the freshly fetched subtree.
          this.replaceNodeById(documentRoot, id, doc);
          expandedCount += 1;
          if (expandedCount >= this.expandMaxNodes) return documentRoot;
        }
      }
    }

    return documentRoot;
  }

  async importFile(fileKey: string, depth?: number): Promise<any> {
    const d = this.normalizeDepth(depth);
    const res = await this.mcp.invokeTool("figma.getFile", { fileKey, depth: d });
    return res;
  }

  async importNodes(fileKey: string, nodeIds: string[], depth?: number): Promise<any> {
    const d = this.normalizeDepth(depth);
    const res = await this.mcp.invokeTool("figma.getNodes", {
      fileKey,
      ids: nodeIds,
      depth: d
    });

    // 단일 노드면 해당 document만 반환
    if (nodeIds.length === 1) {
      const id = nodeIds[0];
      let doc = res?.nodes?.[id]?.document;
      if (doc) doc = await this.expandDeepNodes(fileKey, doc, d);
      if (doc) return { document: doc };
    }

    // 여러 노드면 루트로 감싸서 반환
    const docs = [] as any[];
    for (const id of nodeIds) {
      let doc = res?.nodes?.[id]?.document;
      if (doc) doc = await this.expandDeepNodes(fileKey, doc, d);
      if (doc) docs.push(doc);
    }

    return {
      document: {
        id: "A2UI_NODES_ROOT",
        name: "selected-nodes",
        type: "FRAME",
        children: docs
      }
    };
  }
}
