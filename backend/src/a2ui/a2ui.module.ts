import { Module } from '@nestjs/common';
import { A2uiService } from './a2ui.service';
@Module({providers:[A2uiService],exports:[A2uiService]})
export class A2uiModule {}
