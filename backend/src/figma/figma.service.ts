// src/figma/figma.service.ts
import { Injectable } from "@nestjs/common";
import { McpClient } from "../mcp/mcp.client";

@Injectable()
export class FigmaService {
  constructor(private readonly mcp: McpClient) {}

  private readonly defaultDepth = 6;
  private readonly minDepth = 1;
  private readonly maxDepth = 6;

  private normalizeDepth(depth?: number): number {
    const raw = typeof depth === "number" && Number.isFinite(depth) ? Math.trunc(depth) : this.defaultDepth;
    return Math.min(this.maxDepth, Math.max(this.minDepth, raw));
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
      const doc = res?.nodes?.[id]?.document;
      if (doc) return { document: doc };
    }

    // 여러 노드면 루트로 감싸서 반환
    const docs = nodeIds
      .map((id) => res?.nodes?.[id]?.document)
      .filter(Boolean);

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
