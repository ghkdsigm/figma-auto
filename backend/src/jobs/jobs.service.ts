import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { FigmaService } from "../figma/figma.service";
import { A2uiService } from "../a2ui/a2ui.service";
import { DsMappingService } from "../ds-mapping/ds-mapping.service";
import { CodegenService } from "../codegen/codegen.service";

type Policy = "STRICT" | "TOLERANT" | "MIXED";

@Injectable()
export class JobsService {
  queue!: Queue;
  worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly figma: FigmaService,
    private readonly a2ui: A2uiService,
    private readonly dsMapping: DsMappingService,
    private readonly codegen: CodegenService
  ) {}

  private redis() {
    return new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
  }

  async startWorker() {
    if (this.queue) return;
    const connection = this.redis();
    this.queue = new Queue("a2ui", { connection });

    this.worker = new Worker(
      "a2ui",
      async (job) => {
        const dbJobId = job.data.dbJobId as string;
        await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "RUNNING" } });

        try {
          if (job.name === "INGEST_FIGMA") {
            const raw = await this.figma.importFile(job.data.fileKey);
            const imp = await this.prisma.figmaImport.create({
              data: { projectId: job.data.projectId, fileKey: job.data.fileKey, rawJson: raw }
            });

            await this.queue.add("NORMALIZE_A2UI", { dbJobId, projectId: job.data.projectId, importId: imp.id, fileKey: job.data.fileKey });
            await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "DONE", output: { importId: imp.id } } });
            return;
          }

          if (job.name === "INGEST_SAMPLE") {
            const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "samples", "figma-file.sample.json"), "utf-8"));
            const imp = await this.prisma.figmaImport.create({
              data: { projectId: job.data.projectId, fileKey: "SAMPLE", rawJson: raw }
            });

            await this.queue.add("NORMALIZE_A2UI", { dbJobId, projectId: job.data.projectId, importId: imp.id, fileKey: "SAMPLE" });
            await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "DONE", output: { importId: imp.id } } });
            return;
          }

          if (job.name === "NORMALIZE_A2UI") {
            const imp = await this.prisma.figmaImport.findFirst({ where: { id: job.data.importId, projectId: job.data.projectId } });
            if (!imp) throw new Error("Import not found");

            const spec = this.a2ui.fromFigma(imp.rawJson, job.data.fileKey);
            await this.prisma.figmaImport.update({ where: { id: imp.id }, data: { a2uiSpec: spec as any } });

            const policy: Policy = (job.data.policy as Policy) || "TOLERANT";
            await this.queue.add("MAP_DS", { dbJobId, projectId: job.data.projectId, importId: imp.id, policy });
            return;
          }

          if (job.name === "MAP_DS") {
            const imp = await this.prisma.figmaImport.findFirst({ where: { id: job.data.importId, projectId: job.data.projectId } });
            if (!imp?.a2uiSpec) throw new Error("A2UI spec not found");

            const policy: Policy = (job.data.policy as Policy) || "TOLERANT";
            const ds = this.dsMapping.map(imp.a2uiSpec as any, policy);

            const m = await this.prisma.dsMap.create({
              data: { projectId: job.data.projectId, importId: imp.id, policy, dsSpec: ds as any }
            });

            await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "DONE", output: { importId: imp.id, mapId: m.id } } });
            return;
          }

          if (job.name === "GENERATE_CODE") {
            const policy: Policy = (job.data.policy as Policy) || "TOLERANT";

            const latestImport = await this.prisma.figmaImport.findFirst({
              where: { projectId: job.data.projectId },
              orderBy: { createdAt: "desc" }
            });
            if (!latestImport?.a2uiSpec) throw new Error("No import found");

            let latestMap = await this.prisma.dsMap.findFirst({
              where: { projectId: job.data.projectId, importId: latestImport.id, policy },
              orderBy: { createdAt: "desc" }
            });

            if (!latestMap) {
              const ds = this.dsMapping.map(latestImport.a2uiSpec as any, policy);
              latestMap = await this.prisma.dsMap.create({
                data: { projectId: job.data.projectId, importId: latestImport.id, policy, dsSpec: ds as any }
              });
            }

            const zipPath = await this.codegen.generateZip(job.data.projectId, job.data.target, latestMap.dsSpec as any);
            const art = await this.prisma.codeArtifact.create({
              data: {
                projectId: job.data.projectId,
                target: job.data.target,
                a2uiSpec: latestImport.a2uiSpec as any,
                dsSpec: latestMap.dsSpec as any,
                mappingPolicy: policy,
                outputZip: zipPath
              }
            });

            await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "DONE", output: { artifactId: art.id } } });
            return;
          }

          throw new Error("Unknown job");
        } catch (e: any) {
          await this.prisma.job.update({ where: { id: dbJobId }, data: { status: "FAILED", error: e.message || String(e) } });
          throw e;
        }
      },
      { connection: this.redis() }
    );
  }

  async enqueueImportFigma(projectId: string, fileKey: string) {
    const dbJob = await this.prisma.job.create({
      data: { projectId, type: "INGEST_FIGMA", status: "QUEUED", input: { fileKey } }
    });
    await this.queue.add("INGEST_FIGMA", { dbJobId: dbJob.id, projectId, fileKey });
    return { ok: true, job: dbJob };
  }

  async enqueueImportSample(projectId: string) {
    const dbJob = await this.prisma.job.create({
      data: { projectId, type: "INGEST_SAMPLE", status: "QUEUED", input: {} }
    });
    await this.queue.add("INGEST_SAMPLE", { dbJobId: dbJob.id, projectId });
    return { ok: true, job: dbJob };
  }

  async enqueueGenerate(projectId: string, target = "nuxt", policy: Policy = "TOLERANT") {
    const dbJob = await this.prisma.job.create({
      data: { projectId, type: "GENERATE_CODE", status: "QUEUED", input: { target, policy } }
    });
    await this.queue.add("GENERATE_CODE", { dbJobId: dbJob.id, projectId, target, policy });
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

  async getLatestImport(projectId: string) {
    const imp = await this.prisma.figmaImport.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
    return { ok: true, import: imp };
  }

  async getLatestMap(projectId: string, policy: Policy = "TOLERANT") {
    const imp = await this.prisma.figmaImport.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
    if (!imp) return { ok: true, map: null };
    const map = await this.prisma.dsMap.findFirst({ where: { projectId, importId: imp.id, policy }, orderBy: { createdAt: "desc" } });
    return { ok: true, map };
  }
}
