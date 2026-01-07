import { Injectable, OnModuleInit, OnModuleDestroy, Logger, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { FigmaService } from "../figma/figma.service";
import { A2uiService } from "../a2ui/a2ui.service";
import { DsMappingService } from "../ds-mapping/ds-mapping.service";
import { CodegenService } from "../codegen/codegen.service";

type Policy = "STRICT" | "TOLERANT" | "MIXED" | "RAW";

const QUEUE_NAME = "a2ui";

function getAbsXY(n: any): { x: number; y: number } {
  const x = Number(n?.x ?? n?.absoluteBoundingBox?.x ?? n?.absoluteTransform?.[0]?.[2] ?? 0);
  const y = Number(n?.y ?? n?.absoluteBoundingBox?.y ?? n?.absoluteTransform?.[1]?.[2] ?? 0);

  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0
  };
}

function sortByCanvasPosition(a: any, b: any): number {
  const pa = getAbsXY(a);
  const pb = getAbsXY(b);

  if (pa.y !== pb.y) return pa.y - pb.y;
  if (pa.x !== pb.x) return pa.x - pb.x;

  const ida = String(a?.id ?? "");
  const idb = String(b?.id ?? "");
  return ida.localeCompare(idb);
}

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);

  private queue?: Queue;
  private worker?: Worker;
  private connection?: IORedis;

  private starting?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly figma: FigmaService,
    private readonly a2ui: A2uiService,
    private readonly dsMapping: DsMappingService,
    private readonly codegen: CodegenService
  ) {}

  private createRedisConnectionOptions() {
    const urlFromEnv = process.env.REDIS_URL;
    if (urlFromEnv && urlFromEnv.trim().length > 0) {
      return { url: urlFromEnv, maxRetriesPerRequest: null };
    }

    const host = process.env.REDIS_HOST || "redis";
    const port = Number(process.env.REDIS_PORT || 6379);

    return { host, port, maxRetriesPerRequest: null };
  }

  private createRedisConnection() {
    const options = this.createRedisConnectionOptions();
    if (options.url) {
      return new IORedis(options.url, { maxRetriesPerRequest: null });
    }
    return new IORedis({ host: options.host, port: options.port, maxRetriesPerRequest: null });
  }

  private async ensureWorkerStarted() {
    if (this.worker && this.queue) return;

    if (!this.starting) {
      this.starting = this.startWorker().finally(() => {
        this.starting = undefined;
      });
    }

    await this.starting;
  }

  private async ensureProjectExists(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId }
    });
    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }
    return project;
  }

  async onModuleInit() {
    await this.ensureWorkerStarted();
  }

  async onModuleDestroy() {
    try {
      if (this.worker) await this.worker.close();
    } finally {
      this.worker = undefined;
    }

    try {
      if (this.queue) await this.queue.close();
    } finally {
      this.queue = undefined;
    }

    try {
      if (this.connection) await this.connection.quit();
    } finally {
      this.connection = undefined;
    }
  }

  async process(jobName: string, jobData: any) {
    const dbJobId = jobData.dbJobId as string | undefined;
    if (!dbJobId) {
      throw new Error("Missing dbJobId");
    }

    await this.prisma.job.update({
      where: { id: dbJobId },
      data: { status: "RUNNING" }
    });

    try {
      if (jobName === "INGEST_JSON") {
        const jsonText = fs.readFileSync(jobData.filePath, "utf-8");
        const uploaded = JSON.parse(jsonText);

        const raw = (() => {
          if (uploaded?.document) return uploaded;

          if (Array.isArray(uploaded)) {
            return {
              document: {
                id: "0:0",
                name: "Document",
                type: "DOCUMENT",
                children: [
                  {
                    id: "0:1",
                    name: "Page 1",
                    type: "CANVAS",
                    children: uploaded
                  }
                ]
              }
            };
          }

          if (uploaded?.type === "RESULT" && Array.isArray(uploaded?.payload?.exports)) {
            const meta = uploaded.payload?.meta || {};
            const trees = uploaded.payload.exports
              .map((e: any) => e?.tree)
              .filter((t: any) => Boolean(t))
              .sort(sortByCanvasPosition);

            return {
              document: {
                id: "0:0",
                name: "Document",
                type: "DOCUMENT",
                children: [
                  {
                    id: meta.pageId || "0:1",
                    name: meta.pageName || "Page 1",
                    type: "CANVAS",
                    children: trees
                  }
                ]
              }
            };
          }

          throw new Error(
            "Unsupported JSON shape: expected {document:...} or an array of nodes or {type:'RESULT', payload:{exports:[]}}"
          );
        })();

        const imp = await this.prisma.figmaImport.create({
          data: {
            projectId: jobData.projectId,
            fileKey: jobData.fileKey || "UPLOAD",
            rawJson: raw
          }
        });

        await this.queue!.add("NORMALIZE_A2UI", {
          dbJobId,
          projectId: jobData.projectId,
          importId: imp.id,
          fileKey: imp.fileKey,
          policy: jobData.policy
        });

        await this.prisma.job.update({
          where: { id: dbJobId },
          data: { status: "DONE", output: { importId: imp.id } }
        });

        return;
      }

      if (jobName === "INGEST_FIGMA") {
        const raw = jobData.nodeIds?.length
          ? await this.figma.importNodes(jobData.fileKey, jobData.nodeIds, jobData.depth)
          : await this.figma.importFile(jobData.fileKey, jobData.depth);

        const imp = await this.prisma.figmaImport.create({
          data: {
            projectId: jobData.projectId,
            fileKey: jobData.fileKey,
            rawJson: raw
          }
        });

        await this.queue!.add("NORMALIZE_A2UI", {
          dbJobId,
          projectId: jobData.projectId,
          importId: imp.id,
          fileKey: jobData.fileKey,
          policy: jobData.policy
        });

        await this.prisma.job.update({
          where: { id: dbJobId },
          data: { status: "DONE", output: { importId: imp.id } }
        });

        return;
      }

      if (jobName === "INGEST_SAMPLE") {
        const raw = JSON.parse(
          fs.readFileSync(path.join(process.cwd(), "samples", "figma-file.sample.json"), "utf-8")
        );

        const imp = await this.prisma.figmaImport.create({
          data: {
            projectId: jobData.projectId,
            fileKey: "SAMPLE",
            rawJson: raw
          }
        });

        await this.queue!.add("NORMALIZE_A2UI", {
          dbJobId,
          projectId: jobData.projectId,
          importId: imp.id,
          fileKey: "SAMPLE",
          policy: jobData.policy
        });

        await this.prisma.job.update({
          where: { id: dbJobId },
          data: { status: "DONE", output: { importId: imp.id } }
        });

        return;
      }

      if (jobName === "NORMALIZE_A2UI") {
        const imp = await this.prisma.figmaImport.findFirst({
          where: { id: jobData.importId, projectId: jobData.projectId }
        });

        if (!imp) throw new Error("Import not found");

        const spec = this.a2ui.fromFigma(imp.rawJson, jobData.fileKey, (jobData.policy as any) || "RAW");

        await this.prisma.figmaImport.update({
          where: { id: imp.id },
          data: { a2uiSpec: spec as any }
        });

        const policy: Policy = (jobData.policy as Policy) || "RAW";

        await this.queue!.add("MAP_DS", {
          dbJobId,
          projectId: jobData.projectId,
          importId: imp.id,
          policy
        });

        return;
      }

      if (jobName === "MAP_DS") {
        const imp = await this.prisma.figmaImport.findFirst({
          where: { id: jobData.importId, projectId: jobData.projectId }
        });

        if (!imp?.a2uiSpec) throw new Error("A2UI spec not found");

        const policy: Policy = (jobData.policy as Policy) || "RAW";
        const ds = this.dsMapping.map(imp.a2uiSpec as any, policy);

        const m = await this.prisma.dsMap.create({
          data: {
            projectId: jobData.projectId,
            importId: imp.id,
            policy,
            dsSpec: ds as any
          }
        });

        await this.prisma.job.update({
          where: { id: dbJobId },
          data: { status: "DONE", output: { importId: imp.id, mapId: m.id } }
        });

        return;
      }

      if (jobName === "GENERATE_CODE") {
        const policy: Policy = (jobData.policy as Policy) || "RAW";

        const latestImport = await this.prisma.figmaImport.findFirst({
          where: { projectId: jobData.projectId },
          orderBy: { createdAt: "desc" }
        });

        if (!latestImport?.a2uiSpec) throw new Error("No import found");

        let latestMap = await this.prisma.dsMap.findFirst({
          where: { projectId: jobData.projectId, importId: latestImport.id, policy },
          orderBy: { createdAt: "desc" }
        });

        if (!latestMap) {
          const ds = this.dsMapping.map(latestImport.a2uiSpec as any, policy);
          latestMap = await this.prisma.dsMap.create({
            data: {
              projectId: jobData.projectId,
              importId: latestImport.id,
              policy,
              dsSpec: ds as any
            }
          });
        }

        const zipPath = await this.codegen.generateZip(
          jobData.projectId,
          jobData.target,
          latestMap.dsSpec as any
        );

        const art = await this.prisma.codeArtifact.create({
          data: {
            projectId: jobData.projectId,
            target: jobData.target,
            a2uiSpec: latestImport.a2uiSpec as any,
            dsSpec: latestMap.dsSpec as any,
            mappingPolicy: policy,
            outputZip: zipPath
          }
        });

        await this.prisma.job.update({
          where: { id: dbJobId },
          data: { status: "DONE", output: { artifactId: art.id } }
        });

        return;
      }

      throw new Error(`Unknown job: ${jobName}`);
    } catch (e: any) {
      await this.prisma.job.update({
        where: { id: dbJobId },
        data: { status: "FAILED", error: e?.message || String(e) }
      });
      throw e;
    }
  }

  async startWorker() {
    if (this.worker && this.queue) return;

    this.connection = this.createRedisConnection();
    const connectionOptions = this.createRedisConnectionOptions();

    this.queue = new Queue(QUEUE_NAME, {
      connection: connectionOptions,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 50
      }
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        return this.process(job.name, job.data);
      },
      {
        connection: connectionOptions,
        concurrency: Number(process.env.JOBS_CONCURRENCY || 2)
      }
    );

    this.worker.on("ready", () => {
      this.logger.log(`Worker ready. queue=${QUEUE_NAME}`);
    });

    this.worker.on("failed", (job, err) => {
      this.logger.error(`Worker failed. job=${job?.id} name=${job?.name} err=${err?.message}`);
    });

    this.logger.log(`Worker started. queue=${QUEUE_NAME}`);
  }

  async enqueueImportFigma(projectId: string, fileKey: string, nodeIds?: string[], policy: Policy = "RAW", depth?: number) {
    await this.ensureProjectExists(projectId);
    await this.ensureWorkerStarted();
  
    const dbJob = await this.prisma.job.create({
      data: { projectId, type: "INGEST_FIGMA", status: "QUEUED", input: { fileKey, nodeIds, policy, depth } }
    });
  
    await this.queue!.add("INGEST_FIGMA", { dbJobId: dbJob.id, projectId, fileKey, nodeIds, policy, depth });
  
    return { ok: true, job: dbJob };
  }
  

  async enqueueImportJsonFile(projectId: string, filePath: string, fileKey = "UPLOAD") {
    await this.ensureProjectExists(projectId);
    await this.ensureWorkerStarted();

    const dbJob = await this.prisma.job.create({
      data: { projectId, type: "INGEST_JSON", status: "QUEUED", input: { fileKey, filePath } }
    });

    await this.queue!.add("INGEST_JSON", { dbJobId: dbJob.id, projectId, fileKey, filePath });

    return { ok: true, job: dbJob };
  }

  async enqueueImportSample(projectId: string) {
    await this.ensureProjectExists(projectId);
    await this.ensureWorkerStarted();

    const dbJob = await this.prisma.job.create({
      data: { projectId, type: "INGEST_SAMPLE", status: "QUEUED", input: {} }
    });

    await this.queue!.add("INGEST_SAMPLE", { dbJobId: dbJob.id, projectId });

    return { ok: true, job: dbJob };
  }

  async enqueueGenerate(projectId: string, target = "nuxt", policy: Policy = "RAW") {
    await this.ensureProjectExists(projectId);
    await this.ensureWorkerStarted();

    const dbJob = await this.prisma.job.create({
      data: { projectId, type: "GENERATE_CODE", status: "QUEUED", input: { target, policy } }
    });

    await this.queue!.add("GENERATE_CODE", { dbJobId: dbJob.id, projectId, target, policy });

    return { ok: true, job: dbJob };
  }

  async listArtifacts(projectId: string) {
    const items = await this.prisma.codeArtifact.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" }
    });
    return { ok: true, items };
  }

  async getArtifactPath(projectId: string, artifactId: string) {
    const a = await this.prisma.codeArtifact.findFirst({ where: { id: artifactId, projectId } });
    if (!a) throw new Error("artifact not found");
    return a.outputZip;
  }

  async getArtifactSources(projectId: string, artifactId: string) {
    const a = await this.prisma.codeArtifact.findFirst({ where: { id: artifactId, projectId } });
    if (!a) throw new NotFoundException("artifact not found");
    const dsRoot = a.dsSpec as any;
    return {
      ok: true,
      target: a.target,
      dsSpec: dsRoot,
      files: this.codegen.renderVueSources(dsRoot, a.target)
    };
  }

  async getLatestImport(projectId: string) {
    const imp = await this.prisma.figmaImport.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" }
    });
    return { ok: true, import: imp };
  }

  async getLatestMap(projectId: string, policy: Policy = "RAW") {
    const imp = await this.prisma.figmaImport.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" }
    });
    if (!imp) return { ok: true, map: null };

    const map = await this.prisma.dsMap.findFirst({
      where: { projectId, importId: imp.id, policy },
      orderBy: { createdAt: "desc" }
    });

    return { ok: true, map };
  }

  async getJob(jobId: string) {
    const job = await this.prisma.job.findFirst({ where: { id: jobId } });
    return { ok: true, job };
  }
}
