import type { PrinterApiAdapter, PrintJob } from "./types";

interface MoonrakerJob {
  job_id: string;
  filename: string;
  status: string;
  filament_used: number;
  print_duration: number;
  start_time: number | null;
  end_time: number | null;
  metadata?: {
    filament_weight_total?: number;
    filament_type?: string;
    nozzle_diameter?: number;
  };
}

interface MoonrakerHistoryResponse {
  result: {
    count: number;
    jobs: MoonrakerJob[];
  };
}

interface MoonrakerPrintStatsResponse {
  result: {
    status: {
      print_stats: {
        state: string;
        filament_used: number;
      };
    };
  };
}

function normalizeUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export const MoonrakerAdapter: PrinterApiAdapter = {
  name: "Moonraker",

  async testConnection(baseUrl: string): Promise<boolean> {
    const url = normalizeUrl(baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${url}/server/info`, {
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  },

  async getRecentJobs(baseUrl: string, limit = 10): Promise<PrintJob[]> {
    const url = normalizeUrl(baseUrl);
    const res = await fetch(`${url}/server/history/list?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as MoonrakerHistoryResponse;

    return data.result.jobs.map((job) => {
      let status: PrintJob["status"];
      if (job.status === "completed") status = "completed";
      else if (job.status === "cancelled") status = "cancelled";
      else if (job.status === "error") status = "error";
      else status = "error"; // klippy_shutdown etc.

      return {
        jobId: job.job_id,
        filename: job.filename,
        status,
        filamentUsedMm: job.filament_used,
        filamentWeightG: job.metadata?.filament_weight_total ?? null,
        filamentType: job.metadata?.filament_type ?? null,
        nozzleDiameter: job.metadata?.nozzle_diameter ?? null,
        printDurationSeconds: job.print_duration,
        startTime: job.start_time ? job.start_time * 1000 : null,
        endTime: job.end_time ? job.end_time * 1000 : null,
      };
    });
  },

  async getLiveStatus(
    baseUrl: string
  ): Promise<{ state: string; filamentUsedMm: number } | null> {
    const url = normalizeUrl(baseUrl);
    try {
      const res = await fetch(
        `${url}/printer/objects/query?print_stats`
      );
      if (!res.ok) return null;
      const data = (await res.json()) as MoonrakerPrintStatsResponse;
      const ps = data.result.status.print_stats;
      return { state: ps.state, filamentUsedMm: ps.filament_used };
    } catch {
      return null;
    }
  },
};
