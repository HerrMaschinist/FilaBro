import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export const NotificationService = {
  async requestPermission(): Promise<boolean> {
    if (Platform.OS === "web") return false;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  },

  async scheduleSpoolLowNotification(spoolName: string, remaining: number, total: number): Promise<void> {
    const percent = Math.round((remaining / total) * 100);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Filament wird knapp",
        body: `${spoolName}: noch ${remaining}g (${percent}%) \u00fcbrig`,
        data: { type: "spool_low" },
      },
      trigger: null,
    });
  },

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },
};
