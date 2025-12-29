import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class McpClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.TOOLSERVER_URL || 'http://localhost:4010';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  async invokeTool(name: string, args: any): Promise<any> {
    try {
      const response = await this.client.post(`/tools/${name}/invoke`, args);
      if (response.data.ok) {
        return response.data.result;
      }
      throw new Error(response.data.error || 'Tool invocation failed');
    } catch (error: any) {
      if (error.response) {
        throw new Error(error.response.data?.error || error.message);
      }
      throw error;
    }
  }

  async listTools(): Promise<string[]> {
    try {
      const response = await this.client.get('/tools');
      if (response.data.ok) {
        return response.data.tools || [];
      }
      return [];
    } catch (error) {
      return [];
    }
  }
}

