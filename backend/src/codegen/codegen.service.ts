import { Injectable } from "@nestjs/common";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { v4 as uuid } from "uuid";
import { A2UIRoot, A2UINode } from "../a2ui/spec";

function render(n: A2UINode): string {
  if (n.type === "frame") return `<section class="flex flex-col gap-3">\n${n.children.map(render).join("\n")}\n</section>`;
  if (n.type === "text") return `<p class="text-slate-700">${escape(n.text)}</p>`;
  if (n.type === "button") return `<button class="px-4 py-2 rounded-lg bg-blue-600 text-white">${escape(n.label)}</button>`;
  return "";
}
function escape(s: string){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

@Injectable()
export class CodegenService {
  outDir="/data/artifacts";

  constructor(){ try{ fs.mkdirSync(this.outDir,{recursive:true}); }catch{} }

  async generateZip(projectId: string, target: "nuxt"|"vue", spec: A2UIRoot) {
    const id=uuid();
    const dir=path.join(this.outDir, `${projectId}-${id}-${target}`);
    fs.mkdirSync(dir,{recursive:true});

    if (target==="nuxt") {
      fs.writeFileSync(path.join(dir,"package.json"), JSON.stringify({name:"generated-nuxt",private:true,type:"module",scripts:{dev:"nuxt dev -p 3001"},dependencies:{nuxt:"^3.13.0"}},null,2));
      fs.mkdirSync(path.join(dir,"pages"),{recursive:true});
      fs.mkdirSync(path.join(dir,"components"),{recursive:true});
      fs.writeFileSync(path.join(dir,"pages","index.vue"), `<template><main class="p-6"><GeneratedRoot /></main></template>\n<script setup lang="ts">import GeneratedRoot from '~/components/GeneratedRoot.vue'</script>\n`);
      fs.writeFileSync(path.join(dir,"components","GeneratedRoot.vue"), `<template>\n${render(spec.tree)}\n</template>\n`);
      fs.writeFileSync(path.join(dir,"nuxt.config.ts"), `export default defineNuxtConfig({})\n`);
    } else {
      fs.mkdirSync(path.join(dir,"components"),{recursive:true});
      fs.writeFileSync(path.join(dir,"components","GeneratedRoot.vue"), `<template>\n${render(spec.tree)}\n</template>\n`);
    }

    const zipPath = path.join(this.outDir, `${projectId}-${id}-${target}.zip`);
    await new Promise((resolve,reject)=> {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip",{ zlib:{level:9}});
      output.on("close", () => resolve(null));
      archive.on("error", reject);
      archive.pipe(output);
      archive.directory(dir,false);
      archive.finalize();
    });
    return zipPath;
  }
}
