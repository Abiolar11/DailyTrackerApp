import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSchedule } from "@/context/ScheduleContext";
import { LearnedTask } from "@/types/schedule";
import Colors from "@/constants/colors";

function minutesToTime(minutes: number): string {
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
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function LearnedTaskRow({
  task,
  onReset,
}: {
  task: LearnedTask;
  onReset: () => void;
}) {
  const rowOpacity = useSharedValue(1);
  const rowStyle = useAnimatedStyle(() => ({ opacity: rowOpacity.value }));

  const handleReset = () => {
    Alert.alert(
      "Reset learned data",
      `Remove learned data for "${task.signature}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            rowOpacity.value = withTiming(0, { duration: 200 });
            setTimeout(onReset, 200);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        },
      ]
    );
  };

  return (
    <Animated.View style={[styles.taskRow, rowStyle]}>
      <View style={styles.taskLeft}>
        <View style={styles.taskHeader}>
          <Text style={styles.taskName}>{task.signature}</Text>
          <View style={styles.sampleBadge}>
            <Text style={styles.sampleText}>{task.sampleCount}x</Text>
          </View>
        </View>
        <View style={styles.taskDetails}>
          <View style={styles.detailItem}>
            <Feather name="clock" size={11} color={Colors.theme.textMuted} />
            <Text style={styles.detailText}>{formatDuration(task.typicalDurationMinutes)}</Text>
          </View>
          {task.preferredStartMinutes !== undefined && (
            <View style={styles.detailItem}>
              <Feather name="sun" size={11} color={Colors.theme.textMuted} />
              <Text style={styles.detailText}>~{minutesToTime(task.preferredStartMinutes)}</Text>
            </View>
          )}
          <View style={styles.detailItem}>
            <Feather name="refresh-cw" size={11} color={Colors.theme.textMuted} />
            <Text style={styles.detailText}>{timeAgo(task.lastUsed)}</Text>
          </View>
        </View>
      </View>
      <Pressable
        onPress={handleReset}
        style={({ pressed }) => [
          styles.resetBtn,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Feather name="trash-2" size={14} color={Colors.theme.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { learnedTasks, resetLearnedTask, resetAllLearned } = useSchedule();

  const taskList = Object.values(learnedTasks).sort(
    (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
  );

  const handleResetAll = () => {
    if (taskList.length === 0) return;
    Alert.alert(
      "Reset all learned data",
      "This will remove all learned task patterns. DayFlow will start fresh.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset All",
          style: "destructive",
          onPress: () => {
            resetAllLearned();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <LinearGradient
      colors={[Colors.theme.bg0, Colors.theme.bg1]}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: topPad + 16, paddingBottom: bottomPad + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Learned Patterns</Text>
            <Text style={styles.subtitle}>
              DayFlow personalizes durations from your edits
            </Text>
          </View>
          {taskList.length > 0 && (
            <Pressable
              onPress={handleResetAll}
              style={({ pressed }) => [
                styles.resetAllBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="trash" size={14} color={Colors.palette.red} />
            </Pressable>
          )}
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{taskList.length}</Text>
            <Text style={styles.statLabel}>Patterns</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {taskList.reduce((a, t) => a + t.sampleCount, 0)}
            </Text>
            <Text style={styles.statLabel}>Data points</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {taskList.length > 0
                ? Math.round(
                    taskList.reduce((a, t) => a + t.typicalDurationMinutes, 0) /
                      taskList.length
                  )
                : 0}
            </Text>
            <Text style={styles.statLabel}>Avg min</Text>
          </View>
        </View>

        {/* How it works */}
        <View style={styles.explainer}>
          <Feather name="info" size={14} color={Colors.palette.blue} />
          <Text style={styles.explainerText}>
            When you edit a block's duration in the Schedule view, DayFlow remembers it.
            Future schedules use your preferred durations automatically.
          </Text>
        </View>

        {/* Task list */}
        {taskList.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="database" size={40} color={Colors.theme.textMuted} />
            <Text style={styles.emptyTitle}>No patterns yet</Text>
            <Text style={styles.emptyText}>
              Generate a schedule and edit block durations to start building your personalized patterns.
            </Text>
          </View>
        ) : (
          <View style={styles.taskList}>
            <Text style={styles.sectionLabel}>
              {taskList.length} pattern{taskList.length !== 1 ? "s" : ""}
            </Text>
            {taskList.map((task) => (
              <LearnedTaskRow
                key={task.signature}
                task={task}
                onReset={() => resetLearnedTask(task.signature)}
              />
            ))}
          </View>
        )}
      </ScrollView>
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
  resetAllBtn: {
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
  explainer: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: `${Colors.palette.blue}12`,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: `${Colors.palette.blue}25`,
    alignItems: "flex-start",
  },
  explainerText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.theme.textSub,
    flex: 1,
    lineHeight: 19,
  },
  sectionLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: Colors.theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  taskList: {
    gap: 4,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.theme.bg1,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.theme.border,
  },
  taskLeft: {
    flex: 1,
    gap: 6,
  },
  taskHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  taskName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.theme.text,
    flex: 1,
    textTransform: "capitalize",
  },
  sampleBadge: {
    backgroundColor: `${Colors.palette.blue}22`,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${Colors.palette.blue}40`,
  },
  sampleText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 11,
    color: Colors.palette.blue,
  },
  taskDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.theme.textMuted,
  },
  resetBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.theme.bg2,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
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
});
