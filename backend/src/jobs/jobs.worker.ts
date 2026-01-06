import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { JOBS_QUEUE_NAME } from "./queue.constants";
import { JobsService } from "./jobs.service";

@Injectable()
export class JobsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsWorker.name);
  private worker?: Worker;

  onModuleInit() {
    const urlFromEnv = process.env.REDIS_URL;
    let connectionOptions: { url?: string; host?: string; port?: number; maxRetriesPerRequest: number | null };

    if (urlFromEnv && urlFromEnv.trim().length > 0) {
      connectionOptions = { url: urlFromEnv, maxRetriesPerRequest: null };
    } else {
      const host = process.env.REDIS_HOST || "redis";
      const port = Number(process.env.REDIS_PORT || 6379);
      connectionOptions = { host, port, maxRetriesPerRequest: null };
    }

    this.worker = new Worker(
      JOBS_QUEUE_NAME,
      async (job: Job) => {
        this.logger.log(`Processing job ${job.id} (${job.name})`);
        return this.jobsService.process(job.name, job.data);
      },
      {
        connection: connectionOptions,
        concurrency: Number(process.env.JOBS_CONCURRENCY || 1),
      },
    );

    this.worker.on("completed", (job) => {
      this.logger.log(`Completed job ${job.id} (${job.name})`);
    });

    this.worker.on("failed", (job, err) => {
      this.logger.error(`Failed job ${job?.id} (${job?.name}): ${err?.message}`);
    });

    this.logger.log(`BullMQ Worker started. queue=${JOBS_QUEUE_NAME}`);
  }

  constructor(private readonly jobsService: JobsService) {}

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
