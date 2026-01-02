import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards";
import { JobsService } from "./jobs.service";

@ApiTags("jobs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("jobs")
export class JobStatusController {
  constructor(private readonly jobs: JobsService) {}

  @Get(":jobId")
  getJob(@Param("jobId") jobId: string) {
    return this.jobs.getJob(jobId);
  }
}
