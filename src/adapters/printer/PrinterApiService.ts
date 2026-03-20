import { MoonrakerAdapter } from "./MoonrakerAdapter";
import type { PrinterApiAdapter } from "./types";

const ADAPTERS: PrinterApiAdapter[] = [MoonrakerAdapter];

export const PrinterApiService = {
  getAdapter(name: string): PrinterApiAdapter | null {
    return ADAPTERS.find((a) => a.name === name) ?? null;
  },

  getAllAdapters(): PrinterApiAdapter[] {
    return ADAPTERS;
  },
};
