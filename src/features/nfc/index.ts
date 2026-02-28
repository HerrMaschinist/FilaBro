export type {
  NfcAvailability,
  NfcTagPayload,
  NfcUnavailableReason,
} from "./NfcService";

export {
  checkNfcAvailability,
  scanTagOnce,
  stopScan,
  parseTagPayload,
} from "./NfcService";
