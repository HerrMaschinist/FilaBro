export interface PrintJob {
  jobId: string;
  filename: string;
  status: "completed" | "cancelled" | "error" | "unknown";
  filamentUsedMm: number;
  filamentWeightG: number | null;
  filamentType: string | null;
  nozzleDiameter: number | null;
  printDurationSeconds: number;
  startTime: number | null;
  endTime: number | null;
}

export interface PrinterApiAdapter {
  name: string;
  testConnection(baseUrl: string): Promise<boolean>;
  getRecentJobs(baseUrl: string, limit?: number): Promise<PrintJob[]>;
  getLiveStatus(
    baseUrl: string
  ): Promise<{ state: string; filamentUsedMm: number } | null>;
}
