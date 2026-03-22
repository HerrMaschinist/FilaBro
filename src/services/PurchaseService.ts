import Purchases, { LOG_LEVEL, PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";

const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";

export const PurchaseService = {
  init() {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    const apiKey = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
    if (!apiKey) {
      console.warn("[PurchaseService] Kein API-Key konfiguriert");
      return;
    }
    Purchases.configure({ apiKey });
  },

  async getOfferings() {
    try {
      const offerings = await Purchases.getOfferings();
      return offerings.current ?? null;
    } catch (e) {
      console.warn("[PurchaseService] getOfferings fehlgeschlagen:", e);
      return null;
    }
  },

  async purchaseLifetime(pkg: PurchasesPackage): Promise<boolean> {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo.entitlements.active["FilaBro Pro"] !== undefined;
    } catch (e: any) {
      if (e.userCancelled) return false;
      console.warn("[PurchaseService] Kauf fehlgeschlagen:", e);
      return false;
    }
  },

  async restorePurchases(): Promise<boolean> {
    try {
      const customerInfo = await Purchases.restorePurchases();
      return customerInfo.entitlements.active["FilaBro Pro"] !== undefined;
    } catch (e) {
      console.warn("[PurchaseService] Restore fehlgeschlagen:", e);
      return false;
    }
  },

  async isPro(): Promise<boolean> {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfo.entitlements.active["FilaBro Pro"] !== undefined;
    } catch {
      return false;
    }
  },
};
