import React, { useState, useRef, useCallback } from "react";
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
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSchedule } from "@/context/ScheduleContext";
import { Schedule, TimeBlock } from "@/types/schedule";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import * as Crypto from "expo-crypto";

const PROMPT_EXAMPLES = [
  "Gym at 7am, deep work on app for 3 hours, lunch, meeting at 2pm, study Spanish for 45 min",
  "Morning run, finish quarterly report, coffee with Sarah at 11am, dentist 3–4pm, grocery shopping",
  "Focus block for writing, team standup 9:30am, clear inbox, work on design for 2 hours, evening walk",
];

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, setCurrentSchedule, learnedTasks } = useSchedule();

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);

  const settingsHeight = useSharedValue(0);
  const settingsOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  const settingsAnimStyle = useAnimatedStyle(() => ({
    height: settingsHeight.value,
    opacity: settingsOpacity.value,
    overflow: "hidden",
  }));

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

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      Alert.alert("Empty prompt", "Tell me what you need to do today.");
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
      }));

      const schedule: Schedule = {
        id: Crypto.randomUUID(),
        date: new Date().toISOString().split("T")[0],
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
  }, [prompt, settings, learnedTasks, setCurrentSchedule]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

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
            { paddingTop: topPad + 16, paddingBottom: bottomPad + 100 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Plan Your Day</Text>
              <Text style={styles.date}>{dateStr}</Text>
            </View>
            <Pressable
              onPress={toggleSettings}
              style={({ pressed }) => [
                styles.settingsBtn,
                { opacity: pressed ? 0.7 : 1, backgroundColor: showSettings ? Colors.theme.bg3 : Colors.theme.bg2 },
              ]}
            >
              <Feather
                name="sliders"
                size={18}
                color={showSettings ? Colors.palette.blue : Colors.theme.textSub}
              />
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
                      onPress={() =>
                        updateSettings({
                          bufferMinutes: Math.max(0, settings.bufferMinutes - 5),
                        })
                      }
                      style={styles.bufferBtn}
                    >
                      <Feather name="minus" size={14} color={Colors.theme.textSub} />
                    </Pressable>
                    <Text style={styles.bufferValue}>{settings.bufferMinutes}m</Text>
                    <Pressable
                      onPress={() =>
                        updateSettings({
                          bufferMinutes: Math.min(60, settings.bufferMinutes + 5),
                        })
                      }
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
                  {formatMinutes(
                    timeToMinutes(settings.sleepTime) -
                      timeToMinutes(settings.wakeTime)
                  )}{" "}
                  total
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Prompt Area */}
          <View style={styles.promptCard}>
            <View style={styles.promptHeader}>
              <Feather name="zap" size={16} color={Colors.palette.amber} />
              <Text style={styles.promptLabel}>What do you need to do today?</Text>
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
                colors={
                  isGenerating
                    ? [Colors.theme.bg3, Colors.theme.bg3]
                    : [Colors.palette.blue, Colors.palette.blueDim]
                }
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
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  greeting: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    color: Colors.theme.text,
    letterSpacing: -0.5,
  },
  date: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.theme.textSub,
    marginTop: 2,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
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
    minHeight: 120,
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
