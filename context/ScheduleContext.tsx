import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Schedule, TimeBlock, UserSettings, LearnedTask } from "@/types/schedule";
import {
  requestNotificationPermission,
  scheduleBlockReminders,
  cancelAllReminders,
} from "@/lib/notifications";

const SETTINGS_KEY = "dayflow_settings";
const SCHEDULE_KEY = "dayflow_current_schedule";
const LEARNED_KEY = "dayflow_learned_tasks";
const HISTORY_KEY = "dayflow_schedule_history";

const DEFAULT_SETTINGS: UserSettings = {
  wakeTime: "07:00",
  sleepTime: "23:00",
  bufferMinutes: 10,
  timezone: "auto",
  notificationsEnabled: true,
};

interface ScheduleContextValue {
  settings: UserSettings;
  updateSettings: (s: Partial<UserSettings>) => void;
  currentSchedule: Schedule | null;
  setCurrentSchedule: (s: Schedule | null) => void;
  updateBlock: (blockId: string, updates: Partial<TimeBlock>) => void;
  toggleLock: (blockId: string) => void;
  toggleComplete: (blockId: string) => void;
  learnedTasks: Record<string, LearnedTask>;
  recordTaskCompletion: (title: string, durationMinutes: number, startMinutes: number) => void;
  resetLearnedTask: (signature: string) => void;
  resetAllLearned: () => void;
  scheduleHistory: Schedule[];
  clearHistory: () => void;
  isLoading: boolean;
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [currentSchedule, setCurrentScheduleState] = useState<Schedule | null>(null);
  const [learnedTasks, setLearnedTasks] = useState<Record<string, LearnedTask>>({});
  const [scheduleHistory, setScheduleHistory] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [settingsStr, scheduleStr, learnedStr, historyStr] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(SCHEDULE_KEY),
          AsyncStorage.getItem(LEARNED_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
        ]);
        if (settingsStr) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(settingsStr) });
        if (scheduleStr) setCurrentScheduleState(JSON.parse(scheduleStr));
        if (learnedStr) setLearnedTasks(JSON.parse(learnedStr));
        if (historyStr) setScheduleHistory(JSON.parse(historyStr));
      } catch (e) {
        console.warn("Failed to load from storage", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const updateSettings = useCallback((updates: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(console.warn);
      return next;
    });
  }, []);

  const saveScheduleToHistory = useCallback((schedule: Schedule) => {
    setScheduleHistory((prev) => {
      const filtered = prev.filter((s) => s.date !== schedule.date);
      const next = [schedule, ...filtered].slice(0, 60);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(console.warn);
      return next;
    });
  }, []);

  const setCurrentSchedule = useCallback(
    (s: Schedule | null) => {
      if (currentSchedule) {
        saveScheduleToHistory(currentSchedule);
      }
      setCurrentScheduleState(s);
      if (s) {
        AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(s)).catch(console.warn);
        if (settings.notificationsEnabled) {
          requestNotificationPermission().then((granted) => {
            if (granted) scheduleBlockReminders(s.blocks);
          });
        }
      } else {
        AsyncStorage.removeItem(SCHEDULE_KEY).catch(console.warn);
        cancelAllReminders();
      }
    },
    [currentSchedule, settings.notificationsEnabled, saveScheduleToHistory]
  );

  const persistCurrentSchedule = useCallback((schedule: Schedule) => {
    AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule)).catch(console.warn);
  }, []);

  const updateBlock = useCallback((blockId: string, updates: Partial<TimeBlock>) => {
    setCurrentScheduleState((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)),
      };
      persistCurrentSchedule(next);
      return next;
    });
  }, [persistCurrentSchedule]);

  const toggleLock = useCallback((blockId: string) => {
    setCurrentScheduleState((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === blockId ? { ...b, isLocked: !b.isLocked } : b
        ),
      };
      persistCurrentSchedule(next);
      return next;
    });
  }, [persistCurrentSchedule]);

  const recordTaskCompletion = useCallback(
    (title: string, durationMinutes: number, startMinutes: number) => {
      const sig = title.toLowerCase().trim();
      setLearnedTasks((prev) => {
        const existing = prev[sig];
        let newDuration: number;
        if (existing) {
          newDuration = Math.round(0.3 * durationMinutes + 0.7 * existing.typicalDurationMinutes);
        } else {
          newDuration = durationMinutes;
        }
        const newPreferred = existing?.preferredStartMinutes !== undefined
          ? Math.round(0.3 * startMinutes + 0.7 * existing.preferredStartMinutes)
          : startMinutes;

        const next = {
          ...prev,
          [sig]: {
            signature: sig,
            typicalDurationMinutes: newDuration,
            preferredStartMinutes: newPreferred,
            sampleCount: (existing?.sampleCount ?? 0) + 1,
            lastUsed: new Date().toISOString(),
          },
        };
        AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(next)).catch(console.warn);
        return next;
      });
    },
    []
  );

  const toggleComplete = useCallback((blockId: string) => {
    let completedBlock: TimeBlock | undefined;
    setCurrentScheduleState((prev) => {
      if (!prev) return prev;
      const block = prev.blocks.find((b) => b.id === blockId);
      if (!block) return prev;
      const nowComplete = !block.isCompleted;
      if (nowComplete && !block.isBuffer) {
        completedBlock = block;
      }
      const next = {
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === blockId ? { ...b, isCompleted: nowComplete } : b
        ),
      };
      persistCurrentSchedule(next);
      return next;
    });
    setTimeout(() => {
      if (completedBlock) {
        recordTaskCompletion(completedBlock.title, completedBlock.durationMinutes, completedBlock.startMinutes);
      }
    }, 0);
  }, [persistCurrentSchedule, recordTaskCompletion]);

  const resetLearnedTask = useCallback((signature: string) => {
    setLearnedTasks((prev) => {
      const next = { ...prev };
      delete next[signature];
      AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(next)).catch(console.warn);
      return next;
    });
  }, []);

  const resetAllLearned = useCallback(() => {
    setLearnedTasks({});
    AsyncStorage.removeItem(LEARNED_KEY).catch(console.warn);
  }, []);

  const clearHistory = useCallback(() => {
    setScheduleHistory([]);
    AsyncStorage.removeItem(HISTORY_KEY).catch(console.warn);
  }, []);

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      currentSchedule,
      setCurrentSchedule,
      updateBlock,
      toggleLock,
      toggleComplete,
      learnedTasks,
      recordTaskCompletion,
      resetLearnedTask,
      resetAllLearned,
      scheduleHistory,
      clearHistory,
      isLoading,
    }),
    [
      settings,
      updateSettings,
      currentSchedule,
      setCurrentSchedule,
      updateBlock,
      toggleLock,
      toggleComplete,
      learnedTasks,
      recordTaskCompletion,
      resetLearnedTask,
      resetAllLearned,
      scheduleHistory,
      clearHistory,
      isLoading,
    ]
  );

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error("useSchedule must be used within ScheduleProvider");
  return ctx;
}
