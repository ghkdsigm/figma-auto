import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import fs from "fs";
import path from "path";
import { FigmaService } from "../figma/figma.service";
import { A2uiService } from "../a2ui/a2ui.service";
import { CodegenService } from "../codegen/codegen.service";

@Injectable()
export class JobsService {
  queue!: Queue;
  worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly figma: FigmaService,
    private readonly a2ui: A2uiService,
    private readonly codegen: CodegenService
  ) {}

  private redis(){ return new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null }); }

  async startWorker() {
    if (this.queue) return;
    const connection = this.redis();
    this.queue = new Queue("a2ui", { connection });

    this.worker = new Worker("a2ui", async (job) => {
      const dbJobId = job.data.dbJobId as string;
      await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "RUNNING" } });

      try {
        if (job.name === "IMPORT_FIGMA") {
          const raw = await this.figma.importFile(job.data.fileKey);
          const spec = this.a2ui.fromFigma(raw);
          const imp = await this.prisma.figmaImport.create({ data: { projectId: job.data.projectId, fileKey: job.data.fileKey, rawJson: raw, a2uiSpec: spec as any }});
          await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "DONE", output: { importId: imp.id } } });
          return;
        }
        if (job.name === "IMPORT_SAMPLE") {
          const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "samples", "figma-file.sample.json"), "utf-8"));
          const spec = this.a2ui.fromFigma(raw);
          const imp = await this.prisma.figmaImport.create({ data: { projectId: job.data.projectId, fileKey: "SAMPLE", rawJson: raw, a2uiSpec: spec as any }});
          await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "DONE", output: { importId: imp.id } } });
          return;
        }
        if (job.name === "GENERATE_CODE") {
          const imp = await this.prisma.figmaImport.findFirst({ where: { projectId: job.data.projectId }, orderBy: { createdAt: "desc" } });
          if (!imp?.a2uiSpec) throw new Error("No import found");
          const zipPath = await this.codegen.generateZip(job.data.projectId, job.data.target, imp.a2uiSpec as any);
          const art = await this.prisma.codeArtifact.create({ data: { projectId: job.data.projectId, target: job.data.target, a2uiSpec: imp.a2uiSpec as any, outputZip: zipPath }});
          await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "DONE", output: { artifactId: art.id } } });
          return;
        }
        throw new Error("Unknown job");
      } catch (e: any) {
        await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "FAILED", error: e.message || String(e) } });
        throw e;
      }
    }, { connection: this.redis() });
  }

  async enqueueImportFigma(projectId: string, fileKey: string) {
    const dbJob = await this.prisma.job.create({ data: { projectId, type: "IMPORT_FIGMA", status: "QUEUED", input: { fileKey } } });
    await this.queue.add("IMPORT_FIGMA", { dbJobId: dbJob.id, projectId, fileKey });
    return { ok: true, job: dbJob };
  }

  async enqueueImportSample(projectId: string) {
    const dbJob = await this.prisma.job.create({ data: { projectId, type: "IMPORT_SAMPLE", status: "QUEUED", input: {} } });
    await this.queue.add("IMPORT_SAMPLE", { dbJobId: dbJob.id, projectId });
    return { ok: true, job: dbJob };
  }

  async enqueueGenerate(projectId: string, target: "nuxt" | "vue") {
    const dbJob = await this.prisma.job.create({ data: { projectId, type: "GENERATE_CODE", status: "QUEUED", input: { target } } });
    await this.queue.add("GENERATE_CODE", { dbJobId: dbJob.id, projectId, target });
    return { ok: true, job: dbJob };
  }

  async listArtifacts(projectId: string) {
    const items = await this.prisma.codeArtifact.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
    return { ok: true, items };
  }

  async getArtifactPath(projectId: string, artifactId: string) {
    const a = await this.prisma.codeArtifact.findFirst({ where: { id: artifactId, projectId } });
    if (!a) throw new Error("artifact not found");
    return a.outputZip;
  }
}
