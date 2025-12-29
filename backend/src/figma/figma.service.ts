import { Injectable } from '@nestjs/common';
import { McpClient } from '../mcp/mcp.client';

@Injectable()
export class FigmaService {
  constructor(private readonly mcp: McpClient) {}

  async importFile(fileKey: string, depth?: number): Promise<any> {
    return await this.mcp.invokeTool('figma.getFile', { fileKey, depth });
  }
}

