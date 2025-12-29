import { Injectable } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { A2UIRoot, A2UINode } from "./spec";

function fromNode(n: any): A2UINode | null {
  if (!n) return null;
  if (["DOCUMENT","CANVAS","FRAME","COMPONENT","INSTANCE"].includes(n.type)) {
    return { id: String(n.id || uuid()), type: "frame", children: (n.children||[]).map(fromNode).filter(Boolean) as any[] };
  }
  if (n.type === "TEXT") {
    const txt = String(n.characters || "");
    if (["확인","저장","취소","로그인","다운로드"].some(w => txt.includes(w))) {
      return { id: String(n.id || uuid()), type: "button", label: txt, variant: "primary" };
    }
    return { id: String(n.id || uuid()), type: "text", text: txt };
  }
  return null;
}

@Injectable()
export class A2uiService {
  fromFigma(fileJson: any): A2UIRoot {
    const tree = fromNode(fileJson?.document) || { id: uuid(), type: "frame", children: [] };
    return { version: "0.1", meta: { generatedAt: new Date().toISOString() }, tree };
  }
}
