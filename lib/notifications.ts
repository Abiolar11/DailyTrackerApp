import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { TimeBlock } from "@/types/schedule";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === "granted";
}

export async function scheduleBlockReminders(blocks: TimeBlock[]) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const block of blocks) {
    if (block.isBuffer || block.isCompleted) continue;

    const reminderMinutes = block.startMinutes - 15;
    if (reminderMinutes <= nowMinutes) continue;

    const triggerDate = new Date();
    triggerDate.setHours(Math.floor(reminderMinutes / 60), reminderMinutes % 60, 0, 0);

    if (triggerDate <= now) continue;

    const secondsUntil = Math.floor((triggerDate.getTime() - now.getTime()) / 1000);
    if (secondsUntil <= 0) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Coming up in 15 min",
        body: block.title,
        data: { blockId: block.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
      },
    });
  }
}

export async function cancelAllReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
