import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useSchedule } from "@/context/ScheduleContext";
import { Schedule, TimeBlock, Category } from "@/types/schedule";
import Colors from "@/constants/colors";

function minutesToTimeShort(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) return `${displayH} ${period}`;
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getCategoryColor(category: Category): string {
  return Colors.categories[category] || Colors.categories.other;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

function HistoryCard({
  schedule,
  onPress,
}: {
  schedule: Schedule;
  onPress: () => void;
}) {
  const taskBlocks = schedule.blocks.filter((b) => !b.isBuffer);
  const completedCount = taskBlocks.filter((b) => !!b.isCompleted).length;
  const totalCount = taskBlocks.length;
  const busyMin = taskBlocks.reduce((a, b) => a + b.durationMinutes, 0);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardDateRow}>
          <Text style={styles.cardDate}>
            {isToday(schedule.date) ? "Today" : formatDate(schedule.date)}
          </Text>
          {completedCount === totalCount && totalCount > 0 && (
            <View style={styles.allDoneBadge}>
              <Feather name="check" size={10} color={Colors.palette.green} />
              <Text style={styles.allDoneText}>All done</Text>
            </View>
          )}
        </View>
        <Feather name="chevron-right" size={16} color={Colors.theme.textMuted} />
      </View>
      <Text style={styles.cardPrompt} numberOfLines={2}>
        {schedule.prompt}
      </Text>
      <View style={styles.cardStats}>
        <View style={styles.cardStat}>
          <Feather name="check-circle" size={11} color={Colors.palette.green} />
          <Text style={styles.cardStatText}>
            {completedCount}/{totalCount} done
          </Text>
        </View>
        <View style={styles.cardStat}>
          <Feather name="clock" size={11} color={Colors.theme.textMuted} />
          <Text style={styles.cardStatText}>{formatDuration(busyMin)}</Text>
        </View>
        <View style={styles.cardStat}>
          <Feather name="layers" size={11} color={Colors.theme.textMuted} />
          <Text style={styles.cardStatText}>{totalCount} tasks</Text>
        </View>
      </View>
      {completedCount > 0 && totalCount > 0 && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(completedCount / totalCount) * 100}%` },
            ]}
          />
        </View>
      )}
    </Pressable>
  );
}

function ScheduleDetailModal({
  schedule,
  visible,
  onClose,
}: {
  schedule: Schedule | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!schedule) return null;
  const taskBlocks = schedule.blocks.filter((b) => !b.isBuffer);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>
                {isToday(schedule.date) ? "Today" : formatDate(schedule.date)}
              </Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                {schedule.prompt}
              </Text>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
              <Feather name="x" size={22} color={Colors.theme.textSub} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
            {taskBlocks.map((block) => {
              const color = getCategoryColor(block.category as Category);
              const done = !!block.isCompleted;
              return (
                <View key={block.id} style={styles.taskRow}>
                  <View
                    style={[
                      styles.taskCheck,
                      {
                        borderColor: done ? Colors.palette.green : `${color}60`,
                        backgroundColor: done ? Colors.palette.green : "transparent",
                      },
                    ]}
                  >
                    {done && <Feather name="check" size={10} color="#fff" />}
                  </View>
                  <View style={styles.taskInfo}>
                    <Text
                      style={[
                        styles.taskName,
                        {
                          color: done ? Colors.theme.textMuted : Colors.theme.text,
                          textDecorationLine: done ? "line-through" : "none",
                        },
                      ]}
                    >
                      {block.title}
                    </Text>
                    <Text style={styles.taskTime}>
                      {minutesToTimeShort(block.startMinutes)} –{" "}
                      {minutesToTimeShort(block.endMinutes)} ({formatDuration(block.durationMinutes)})
                    </Text>
                  </View>
                  <View
                    style={[styles.taskCategoryDot, { backgroundColor: color }]}
                  />
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { scheduleHistory, clearHistory, learnedTasks, resetAllLearned } = useSchedule();
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  const handleClear = () => {
    if (scheduleHistory.length === 0) return;
    Alert.alert("Clear History", "Remove all past schedules?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          clearHistory();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const learnedCount = Object.keys(learnedTasks).length;

  return (
    <LinearGradient colors={[Colors.theme.bg0, Colors.theme.bg1]} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: topPad + 16, paddingBottom: bottomPad + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>History</Text>
            <Text style={styles.subtitle}>Your past schedules and tasks</Text>
          </View>
          {scheduleHistory.length > 0 && (
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [
                styles.clearBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="trash" size={14} color={Colors.palette.red} />
            </Pressable>
          )}
        </View>

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{scheduleHistory.length}</Text>
            <Text style={styles.statLabel}>Days</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {scheduleHistory.reduce(
                (a, s) =>
                  a + s.blocks.filter((b) => !b.isBuffer && !!b.isCompleted).length,
                0
              )}
            </Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{learnedCount}</Text>
            <Text style={styles.statLabel}>Patterns</Text>
          </View>
        </View>

        {learnedCount > 0 && (
          <View style={styles.learnedHint}>
            <Feather name="cpu" size={13} color={Colors.palette.blue} />
            <Text style={styles.learnedHintText}>
              {learnedCount} learned pattern{learnedCount !== 1 ? "s" : ""} — future schedules auto-use your preferred durations
            </Text>
            <Pressable
              onPress={() => {
                Alert.alert("Reset Learned Data", "Remove all learned patterns?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Reset", style: "destructive", onPress: resetAllLearned },
                ]);
              }}
              hitSlop={8}
            >
              <Feather name="x" size={14} color={Colors.theme.textMuted} />
            </Pressable>
          </View>
        )}

        {scheduleHistory.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="clock" size={40} color={Colors.theme.textMuted} />
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptyText}>
              Your completed schedules will appear here. Generate a schedule from the Today tab to get started.
            </Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            {scheduleHistory.map((schedule) => (
              <HistoryCard
                key={schedule.id}
                schedule={schedule}
                onPress={() => setSelectedSchedule(schedule)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <ScheduleDetailModal
        schedule={selectedSchedule}
        visible={!!selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    color: Colors.theme.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.theme.textSub,
    marginTop: 2,
  },
  clearBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${Colors.palette.red}18`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${Colors.palette.red}30`,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.theme.bg1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.theme.border,
  },
  statNumber: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    color: Colors.theme.text,
    lineHeight: 32,
  },
  statLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: Colors.theme.textMuted,
  },
  learnedHint: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: `${Colors.palette.blue}12`,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: `${Colors.palette.blue}25`,
    alignItems: "center",
  },
  learnedHintText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.theme.textSub,
    flex: 1,
    lineHeight: 17,
  },
  emptyState: {
    alignItems: "center",
    gap: 12,
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
    color: Colors.theme.text,
  },
  emptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.theme.textSub,
    textAlign: "center",
    lineHeight: 21,
  },
  cardList: {
    gap: 10,
  },
  card: {
    backgroundColor: Colors.theme.bg1,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.theme.border,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardDate: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
    color: Colors.theme.text,
  },
  allDoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: `${Colors.palette.green}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  allDoneText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 10,
    color: Colors.palette.green,
  },
  cardPrompt: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.theme.textSub,
    lineHeight: 18,
  },
  cardStats: {
    flexDirection: "row",
    gap: 14,
  },
  cardStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardStatText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.theme.textMuted,
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.theme.bg3,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    backgroundColor: Colors.palette.green,
    borderRadius: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.theme.bg1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "80%",
    borderTopWidth: 1,
    borderColor: Colors.theme.border,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.theme.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
    color: Colors.theme.text,
  },
  modalSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.theme.textSub,
    marginTop: 2,
    maxWidth: 280,
  },
  modalScroll: {
    flexGrow: 0,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.theme.border,
  },
  taskCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  taskInfo: {
    flex: 1,
    gap: 2,
  },
  taskName: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
  },
  taskTime: {
    fontFamily: "DMMono_400Regular",
    fontSize: 11,
    color: Colors.theme.textMuted,
  },
  taskCategoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
