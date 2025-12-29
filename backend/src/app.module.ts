import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { ProjectsModule } from "./projects/projects.module";
import { JobsModule } from "./jobs/jobs.module";
import { FigmaModule } from "./figma/figma.module";
import { A2uiModule } from "./a2ui/a2ui.module";
import { CodegenModule } from "./codegen/codegen.module";

@Module({
  imports:[PrismaModule,AuthModule,ProjectsModule,JobsModule,FigmaModule,A2uiModule,CodegenModule]
})
export class AppModule {}
