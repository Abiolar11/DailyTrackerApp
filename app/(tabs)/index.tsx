import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSchedule } from "@/context/ScheduleContext";
import { Schedule, TimeBlock } from "@/types/schedule";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const PROMPT_EXAMPLES = [
  "Gym at 7am, deep work on app for 3 hours, lunch, meeting at 2pm, study Spanish for 45 min",
  "Morning run, finish quarterly report, coffee with Sarah at 11am, dentist 3–4pm, grocery shopping",
  "Focus block for writing, team standup 9:30am, clear inbox, work on design for 2 hours, evening walk",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWeekDates(date: Date): Date[] {
  const day = date.getDay();
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - day);
  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    week.push(d);
  }
  return week;
}

function getMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const startDate = new Date(firstDay);
  startDate.setDate(1 - startDay);

  const weeks: Date[][] = [];
  const cursor = new Date(startDate);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, setCurrentSchedule, learnedTasks, scheduleHistory } = useSchedule();

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);

  const expandAnim = useSharedValue(0);
  const settingsHeight = useSharedValue(0);
  const settingsOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  const settingsAnimStyle = useAnimatedStyle(() => ({
    height: settingsHeight.value,
    opacity: settingsOpacity.value,
    overflow: "hidden" as const,
  }));

  const monthGridAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandAnim.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    maxHeight: interpolate(expandAnim.value, [0, 1], [0, 320], Extrapolation.CLAMP),
    overflow: "hidden" as const,
  }));

  const weekStripAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandAnim.value, [0, 1], [1, 0], Extrapolation.CLAMP),
    maxHeight: interpolate(expandAnim.value, [0, 1], [100, 0], Extrapolation.CLAMP),
    overflow: "hidden" as const,
  }));

  const toggleCalendar = () => {
    const next = !calendarExpanded;
    setCalendarExpanded(next);
    expandAnim.value = withSpring(next ? 1 : 0, { damping: 20, stiffness: 150 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleSettings = () => {
    const next = !showSettings;
    setShowSettings(next);
    if (next) {
      settingsHeight.value = withSpring(280, { damping: 20 });
      settingsOpacity.value = withTiming(1, { duration: 200 });
    } else {
      settingsHeight.value = withSpring(0, { damping: 20 });
      settingsOpacity.value = withTiming(0, { duration: 150 });
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const navigateMonth = (dir: number) => {
    let m = viewMonth + dir;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const goToToday = () => {
    setSelectedDate(today);
    setViewMonth(today.getMonth());
    setViewYear(today.getFullYear());
    if (calendarExpanded) {
      setCalendarExpanded(false);
      expandAnim.value = withSpring(0, { damping: 20, stiffness: 150 });
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const monthGrid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const datesWithSchedules = useMemo(() => {
    const set = new Set<string>();
    scheduleHistory.forEach((s) => set.add(s.date));
    return set;
  }, [scheduleHistory]);

  const isToday = isSameDay(selectedDate, today);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      Alert.alert("Empty prompt", "Tell me what you need to do.");
      return;
    }
    setIsGenerating(true);
    buttonScale.value = withSpring(0.96);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const learnedForApi: Record<string, { typicalDurationMinutes: number; preferredStartMinutes?: number }> = {};
      Object.entries(learnedTasks).forEach(([sig, task]) => {
        learnedForApi[sig] = {
          typicalDurationMinutes: task.typicalDurationMinutes,
          preferredStartMinutes: task.preferredStartMinutes,
        };
      });

      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/parse-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          wakeTime: settings.wakeTime,
          sleepTime: settings.sleepTime,
          bufferMinutes: settings.bufferMinutes,
          learnedTasks: learnedForApi,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate schedule");
      }

      const data = await response.json();
      const blocks: TimeBlock[] = data.blocks.map((b: TimeBlock) => ({
        ...b,
        isLocked: false,
        isCompleted: false,
      }));

      const schedule: Schedule = {
        id: generateId(),
        date: formatDateISO(selectedDate),
        prompt: prompt.trim(),
        blocks,
        generatedAt: new Date().toISOString(),
        wakeMinutes: data.wakeMinutes,
        sleepMinutes: data.sleepMinutes,
      };

      setCurrentSchedule(schedule);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/(tabs)/schedule");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not generate schedule. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGenerating(false);
      buttonScale.value = withSpring(1);
    }
  }, [prompt, settings, learnedTasks, setCurrentSchedule, selectedDate]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const selectedDateLabel = isToday
    ? "Today"
    : selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <LinearGradient
      colors={[Colors.theme.bg0, Colors.theme.bg1, Colors.theme.bg0]}
      locations={[0, 0.5, 1]}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: topPad + 8, paddingBottom: bottomPad + 100 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Calendar Header */}
          <View style={styles.calHeader}>
            <Pressable onPress={toggleSettings} style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}>
              <Feather name="sliders" size={20} color={showSettings ? Colors.palette.blue : Colors.theme.textSub} />
            </Pressable>
            <Pressable onPress={toggleCalendar} style={styles.calTitleWrap}>
              <Text style={styles.calTitle}>{calendarExpanded ? MONTH_NAMES[viewMonth] : selectedDateLabel}</Text>
              {!calendarExpanded && (
                <Text style={styles.calSubtitle}>{MONTH_NAMES[selectedDate.getMonth()]}</Text>
              )}
              <Feather
                name={calendarExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={Colors.theme.textSub}
                style={{ marginTop: 2 }}
              />
            </Pressable>
            <Pressable onPress={goToToday} style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}>
              <Feather name="calendar" size={20} color={Colors.palette.blue} />
            </Pressable>
          </View>

          {/* Settings Panel */}
          <Animated.View style={settingsAnimStyle}>
            <View style={styles.settingsPanel}>
              <Text style={styles.settingsTitle}>Day Settings</Text>
              <View style={styles.settingsRow}>
                <View style={styles.settingItem}>
                  <Text style={styles.settingLabel}>Wake up</Text>
                  <TextInput
                    style={styles.settingInput}
                    value={settings.wakeTime}
                    onChangeText={(v) => updateSettings({ wakeTime: v })}
                    placeholder="07:00"
                    placeholderTextColor={Colors.theme.textMuted}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={styles.settingItem}>
                  <Text style={styles.settingLabel}>Sleep</Text>
                  <TextInput
                    style={styles.settingInput}
                    value={settings.sleepTime}
                    onChangeText={(v) => updateSettings({ sleepTime: v })}
                    placeholder="23:00"
                    placeholderTextColor={Colors.theme.textMuted}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={styles.settingItem}>
                  <Text style={styles.settingLabel}>Buffer</Text>
                  <View style={styles.bufferRow}>
                    <Pressable
                      onPress={() => updateSettings({ bufferMinutes: Math.max(0, settings.bufferMinutes - 5) })}
                      style={styles.bufferBtn}
                    >
                      <Feather name="minus" size={14} color={Colors.theme.textSub} />
                    </Pressable>
                    <Text style={styles.bufferValue}>{settings.bufferMinutes}m</Text>
                    <Pressable
                      onPress={() => updateSettings({ bufferMinutes: Math.min(60, settings.bufferMinutes + 5) })}
                      style={styles.bufferBtn}
                    >
                      <Feather name="plus" size={14} color={Colors.theme.textSub} />
                    </Pressable>
                  </View>
                </View>
              </View>
              <View style={styles.settingNote}>
                <Feather name="info" size={12} color={Colors.theme.textMuted} />
                <Text style={styles.settingNoteText}>
                  Available window: {settings.wakeTime} – {settings.sleepTime} •{" "}
                  {formatMinutes(timeToMinutes(settings.sleepTime) - timeToMinutes(settings.wakeTime))} total
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Week Strip (collapsed view) */}
          <Animated.View style={weekStripAnimStyle}>
            <View style={styles.weekStrip}>
              <View style={styles.dayRow}>
                {weekDates.map((date, i) => {
                  const sel = isSameDay(date, selectedDate);
                  const isT = isSameDay(date, today);
                  const hasSched = datesWithSchedules.has(formatDateISO(date));
                  return (
                    <Pressable key={i} onPress={() => selectDate(date)} style={styles.dayCol}>
                      <Text style={[styles.dayName, sel && styles.dayNameSelected]}>{DAY_NAMES[i]}</Text>
                      <View style={[styles.dayCircle, sel && styles.dayCircleSelected]}>
                        <Text style={[styles.dayNumber, sel && styles.dayNumberSelected, isT && !sel && styles.dayNumberToday]}>
                          {date.getDate()}
                        </Text>
                      </View>
                      {hasSched && <View style={styles.dot} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Animated.View>

          {/* Full Month Calendar (expanded view) */}
          <Animated.View style={monthGridAnimStyle}>
            <View style={styles.monthCalendar}>
              <View style={styles.monthNav}>
                <Pressable onPress={() => navigateMonth(-1)} style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <Feather name="chevron-left" size={20} color={Colors.theme.textSub} />
                </Pressable>
                <Text style={styles.monthNavTitle}>
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </Text>
                <Pressable onPress={() => navigateMonth(1)} style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <Feather name="chevron-right" size={20} color={Colors.theme.textSub} />
                </Pressable>
              </View>
              <View style={styles.weekdayHeader}>
                {DAY_NAMES.map((d) => (
                  <Text key={d} style={styles.weekdayText}>{d}</Text>
                ))}
              </View>
              {monthGrid.map((week, wi) => (
                <View key={wi} style={styles.monthWeekRow}>
                  {week.map((date, di) => {
                    const inMonth = date.getMonth() === viewMonth;
                    const sel = isSameDay(date, selectedDate);
                    const isT = isSameDay(date, today);
                    const hasSched = datesWithSchedules.has(formatDateISO(date));
                    return (
                      <Pressable
                        key={di}
                        onPress={() => {
                          selectDate(date);
                          if (!inMonth) {
                            setViewMonth(date.getMonth());
                            setViewYear(date.getFullYear());
                          }
                        }}
                        style={styles.monthDayCell}
                      >
                        <View style={[styles.monthDayCircle, sel && styles.monthDayCircleSelected]}>
                          <Text
                            style={[
                              styles.monthDayText,
                              !inMonth && styles.monthDayTextMuted,
                              sel && styles.monthDayTextSelected,
                              isT && !sel && styles.monthDayTextToday,
                            ]}
                          >
                            {date.getDate()}
                          </Text>
                        </View>
                        {hasSched && <View style={styles.dotSmall} />}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Prompt Area */}
          <View style={styles.promptCard}>
            <View style={styles.promptHeader}>
              <Feather name="zap" size={16} color={Colors.palette.amber} />
              <Text style={styles.promptLabel}>
                {isToday ? "What do you need to do today?" : `Plan for ${selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </Text>
            </View>
            <TextInput
              style={styles.promptInput}
              value={prompt}
              onChangeText={setPrompt}
              multiline
              placeholder={PROMPT_EXAMPLES[exampleIndex]}
              placeholderTextColor={Colors.theme.textMuted}
              textAlignVertical="top"
              onFocus={() => setExampleIndex((i) => (i + 1) % PROMPT_EXAMPLES.length)}
            />
            <View style={styles.promptHints}>
              <View style={styles.hint}>
                <Feather name="clock" size={11} color={Colors.theme.textMuted} />
                <Text style={styles.hintText}>Include exact times, durations, or windows</Text>
              </View>
            </View>
          </View>

          {/* Generate Button */}
          <Animated.View style={[{ transform: [{ scale: buttonScale }] }]}>
            <Pressable
              onPress={handleGenerate}
              disabled={isGenerating}
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
            >
              <LinearGradient
                colors={isGenerating ? [Colors.theme.bg3, Colors.theme.bg3] : [Colors.palette.blue, Colors.palette.blueDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.generateBtn}
              >
                {isGenerating ? (
                  <ActivityIndicator color={Colors.theme.text} size="small" />
                ) : (
                  <Feather name="cpu" size={18} color="#fff" />
                )}
                <Text style={styles.generateBtnText}>
                  {isGenerating ? "Generating..." : "Generate Schedule"}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 12,
  },
  calHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.theme.bg2,
    alignItems: "center",
    justifyContent: "center",
  },
  calTitleWrap: {
    alignItems: "center",
  },
  calTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    color: Colors.theme.text,
    letterSpacing: -0.3,
  },
  calSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.theme.textSub,
    marginTop: 1,
  },
  weekStrip: {
    paddingVertical: 4,
  },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  dayName: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: Colors.theme.textSub,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  dayNameSelected: {
    color: Colors.palette.blue,
  },
  dayCircle: {
    width: 40,
    height: 48,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircleSelected: {
    backgroundColor: Colors.palette.blue,
    borderRadius: 20,
  },
  dayNumber: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 18,
    color: Colors.theme.text,
  },
  dayNumberSelected: {
    color: "#fff",
  },
  dayNumberToday: {
    color: Colors.palette.blue,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.palette.blue,
    marginTop: -2,
  },
  monthCalendar: {
    backgroundColor: Colors.theme.bg1,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.theme.border,
  },
  monthNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.theme.bg2,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: Colors.theme.text,
  },
  weekdayHeader: {
    flexDirection: "row",
    marginBottom: 6,
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
    color: Colors.theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  monthWeekRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  monthDayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 2,
  },
  monthDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  monthDayCircleSelected: {
    backgroundColor: Colors.palette.blue,
    borderRadius: 12,
  },
  monthDayText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: Colors.theme.text,
  },
  monthDayTextMuted: {
    color: Colors.theme.textMuted,
  },
  monthDayTextSelected: {
    color: "#fff",
  },
  monthDayTextToday: {
    color: Colors.palette.blue,
  },
  dotSmall: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.palette.blue,
    marginTop: 1,
  },
  settingsPanel: {
    backgroundColor: Colors.theme.bg2,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.theme.border,
  },
  settingsTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: Colors.theme.textSub,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  settingsRow: {
    flexDirection: "row",
    gap: 10,
  },
  settingItem: {
    flex: 1,
    gap: 6,
  },
  settingLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
    color: Colors.theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  settingInput: {
    backgroundColor: Colors.theme.bg3,
    borderRadius: 10,
    padding: 10,
    color: Colors.theme.text,
    fontFamily: "DMMono_400Regular",
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.theme.border,
    textAlign: "center",
  },
  bufferRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.theme.bg3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.theme.border,
    overflow: "hidden",
  },
  bufferBtn: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  bufferValue: {
    fontFamily: "DMMono_400Regular",
    fontSize: 14,
    color: Colors.theme.text,
    minWidth: 30,
    textAlign: "center",
  },
  settingNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  settingNoteText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.theme.textMuted,
    flex: 1,
  },
  promptCard: {
    backgroundColor: Colors.theme.bg1,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.theme.border,
    gap: 12,
  },
  promptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  promptLabel: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.theme.text,
  },
  promptInput: {
    color: Colors.theme.text,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: "top",
  },
  promptHints: {
    gap: 4,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  hintText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.theme.textMuted,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    height: 56,
  },
  generateBtnText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: 0.2,
  },
});
