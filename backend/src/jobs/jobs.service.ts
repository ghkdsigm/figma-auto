import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { FigmaService } from "../figma/figma.service";
import { A2uiService } from "../a2ui/a2ui.service";
import { DsMappingService } from "../ds-mapping/ds-mapping.service";
import { CodegenService } from "../codegen/codegen.service";

type Policy = "STRICT" | "TOLERANT" | "MIXED";

const QUEUE_NAME = "a2ui";

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

  private createRedisConnection() {
    const urlFromEnv = process.env.REDIS_URL;
    if (urlFromEnv && urlFromEnv.trim().length > 0) {
      return new IORedis(urlFromEnv, { maxRetriesPerRequest: null });
    }

    const host = process.env.REDIS_HOST || "redis";
    const port = Number(process.env.REDIS_PORT || 6379);

    return new IORedis({ host, port, maxRetriesPerRequest: null });
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
      if (jobName === "INGEST_FIGMA") {
        const raw = await this.figma.importFile(jobData.fileKey);

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

        const spec = this.a2ui.fromFigma(imp.rawJson, jobData.fileKey);

        await this.prisma.figmaImport.update({
          where: { id: imp.id },
          data: { a2uiSpec: spec as any }
        });

        const policy: Policy = (jobData.policy as Policy) || "TOLERANT";

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

        const policy: Policy = (jobData.policy as Policy) || "TOLERANT";
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
        const policy: Policy = (jobData.policy as Policy) || "TOLERANT";

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

    this.queue = new Queue(QUEUE_NAME, {
      connection: this.connection,
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
        connection: this.connection,
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

  async enqueueImportFigma(projectId: string, fileKey: string) {
    await this.ensureWorkerStarted();

    if (!fileKey || String(fileKey).trim().length === 0) {
      throw new Error("fileKey is required");
    }

    const existing = await this.prisma.job.findFirst({
      where: {
        projectId,
        type: "INGEST_FIGMA",
        status: { in: ["QUEUED", "RUNNING"] },
        input: {
          path: ["fileKey"],
          equals: fileKey
        }
      },
      orderBy: { createdAt: "desc" }
    });

    if (existing) {
      return { ok: true, job: existing, deduped: true };
    }

    const dbJob = await this.prisma.job.create({
      data: { projectId, type: "INGEST_FIGMA", status: "QUEUED", input: { fileKey } }
    });

    const jobId = `INGEST_FIGMA:${projectId}:${fileKey}`;

    try {
      await this.queue!.add(
        "INGEST_FIGMA",
        { dbJobId: dbJob.id, projectId, fileKey },
        {
          jobId,
          attempts: 1,
          removeOnComplete: 50,
          removeOnFail: 50
        }
      );
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("Job") && msg.includes("already exists")) {
        const fallback = await this.prisma.job.findFirst({
          where: {
            projectId,
            type: "INGEST_FIGMA",
            status: { in: ["QUEUED", "RUNNING"] },
            input: { path: ["fileKey"], equals: fileKey }
          },
          orderBy: { createdAt: "desc" }
        });

        if (fallback) return { ok: true, job: fallback, deduped: true };
      }
      throw e;
    }

    return { ok: true, job: dbJob, deduped: false };
  }


  async enqueueImportSample(projectId: string) {
    await this.ensureWorkerStarted();

    const dbJob = await this.prisma.job.create({
      data: { projectId, type: "INGEST_SAMPLE", status: "QUEUED", input: {} }
    });

    await this.queue!.add("INGEST_SAMPLE", { dbJobId: dbJob.id, projectId });

    return { ok: true, job: dbJob };
  }

  async enqueueGenerate(projectId: string, target = "nuxt", policy: Policy = "TOLERANT") {
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

  async getLatestImport(projectId: string) {
    const imp = await this.prisma.figmaImport.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" }
    });
    return { ok: true, import: imp };
  }

  async getLatestMap(projectId: string, policy: Policy = "TOLERANT") {
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
}
