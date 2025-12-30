import { Module, OnModuleInit } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { AuthService } from "../auth/auth.service";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { FigmaModule } from "../figma/figma.module";
import { A2uiModule } from "../a2ui/a2ui.module";
import { CodegenModule } from "../codegen/codegen.module";
import { DsMappingModule } from "../ds-mapping/ds-mapping.module";
import { JobsWorker } from "./jobs.worker";

@Module({
  imports:[AuthModule, ProjectsModule, FigmaModule, A2uiModule, DsMappingModule, CodegenModule],
  providers:[JobsService, JobsWorker],
  controllers:[JobsController]
})
export class JobsModule implements OnModuleInit {
  constructor(private readonly auth: AuthService, private readonly jobs: JobsService) {}
  async onModuleInit(){ await this.auth.ensureBootstrapAdmin(); await this.jobs.startWorker(); }
}
