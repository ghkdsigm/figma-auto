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

private isContainerNode(n: any): boolean {
  const t = String(n?.type || "");
  return ["FRAME", "GROUP", "INSTANCE", "COMPONENT", "COMPONENT_SET"].includes(t);
}

private collectExpandableIds(root: any, max: number, seen: Set<string>): string[] {
  const out: string[] = [];
  const stack: any[] = [root];

  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (out.length >= max) break;

    const id = n?.id ? String(n.id) : "";
    const children = Array.isArray(n?.children) ? n.children : null;

    // Figma API depth 제한에 걸리면 중간 컨테이너(주로 FRAME/GROUP/INSTANCE 등)가
    // children: [] 형태로 truncate 된다. 이름 규칙에 의존하지 말고,
    // 컨테이너 + 빈 children 을 확장 대상으로 본다.
    if (id && !seen.has(id) && this.isContainerNode(n) && children && children.length === 0) {
      out.push(id);
      seen.add(id);
    }

    if (children && children.length) {
      for (const c of children) stack.push(c);
    }
  }

  return out;
}

private replaceSubtree(root: any, replacements: Record<string, any>) {
  const stack: any[] = [root];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;

    const id = n?.id ? String(n.id) : "";
    if (id && replacements[id]) {
      const rep = replacements[id];
      // children 만 갈아끼우면 style/effects 등이 업데이트되지 않아
      // shadow/line/vector 등이 누락되는 케이스가 있었다.
      // 동일 id 노드는 전체 필드를 in-place로 덮어쓴다.
      const keepId = n.id;
      for (const k of Object.keys(n)) delete (n as any)[k];
      Object.assign(n, rep);
      n.id = keepId;
    }

    const children = Array.isArray(n?.children) ? n.children : [];
    for (const c of children) stack.push(c);
  }
}

private async expandTruncatedTree(fileKey: string, document: any, depth: number): Promise<any> {
  const rounds = Number(process.env.FIGMA_EXPAND_ROUNDS ?? 2);
  const maxNodes = Number(process.env.FIGMA_EXPAND_MAX_NODES ?? 200);

  let current = document;
  const seen = new Set<string>();

  for (let r = 0; r < rounds; r++) {
    const ids = this.collectExpandableIds(current, maxNodes, seen);
    if (!ids.length) break;

    const res = await this.mcp.invokeTool("figma.getNodes", { fileKey, ids, depth });
    const replacements: Record<string, any> = {};

    for (const id of ids) {
      const doc = res?.nodes?.[id]?.document;
      if (doc) replacements[id] = doc;
    }

    this.replaceSubtree(current, replacements);
  }

  return current;
}

  async importFile(fileKey: string, depth?: number): Promise<any> {
    const d = this.normalizeDepth(depth);
    const res = await this.mcp.invokeTool("figma.getFile", { fileKey, depth: d });
    const doc = res?.document;
    if (doc) {
      res.document = await this.expandTruncatedTree(fileKey, doc, d);
    }
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
      if (doc) {
        const expanded = await this.expandTruncatedTree(fileKey, doc, d);
        return { document: expanded };
      }
    }

    // 여러 노드면 루트로 감싸서 반환
    const docs = nodeIds
      .map((id) => res?.nodes?.[id]?.document)
      .filter(Boolean);

    const expandedDocs = [] as any[];
    for (const doc of docs) {
      expandedDocs.push(await this.expandTruncatedTree(fileKey, doc, d));
    }

    return {
      document: {
        id: "A2UI_NODES_ROOT",
        name: "selected-nodes",
        type: "FRAME",
        children: expandedDocs
      }
    };
  }
}
