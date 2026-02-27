import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSchedule } from "@/context/ScheduleContext";
import { TimeBlock, Category } from "@/types/schedule";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const MIN_PER_PX = 1.3; // 1 minute = 1.3px
const HOUR_HEIGHT = 60 * MIN_PER_PX;
const LEFT_GUTTER = 52;

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

function minutesToTimeShort(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) return `${displayH} ${period}`;
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

function minutesToInputFormat(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

function parseTimeInput(str: string): number | null {
  const cleaned = str.trim().toUpperCase().replace(/\s+/g, " ");
  const full = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (full) {
    let h = parseInt(full[1]);
    const m = parseInt(full[2]);
    const period = full[3];
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (period === "AM" && h === 12) h = 0;
    else if (period === "PM" && h !== 12) h += 12;
    return h * 60 + m;
  }
  const short = cleaned.match(/^(\d{1,2})\s*(AM|PM)$/);
  if (short) {
    let h = parseInt(short[1]);
    const period = short[2];
    if (h < 1 || h > 12) return null;
    if (period === "AM" && h === 12) h = 0;
    else if (period === "PM" && h !== 12) h += 12;
    return h * 60;
  }
  return null;
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

const SNAP_INTERVAL = 5;

function snapToInterval(minutes: number): number {
  return Math.round(minutes / SNAP_INTERVAL) * SNAP_INTERVAL;
}

function BlockItem({
  block,
  wakeMinutes,
  sleepMinutes,
  containerWidth,
  onPress,
  onToggleComplete,
  onDragStart,
  onDragMove,
  onDragEnd,
  isDragging,
  dragOffset,
}: {
  block: TimeBlock;
  wakeMinutes: number;
  sleepMinutes: number;
  containerWidth: number;
  onPress: (block: TimeBlock) => void;
  onToggleComplete: (blockId: string) => void;
  onDragStart: (blockId: string) => void;
  onDragMove: (blockId: string, dy: number) => void;
  onDragEnd: (blockId: string) => void;
  isDragging: boolean;
  dragOffset: number;
}) {
  const scale = useSharedValue(1);
  const baseTop = (block.startMinutes - wakeMinutes) * MIN_PER_PX;
  const top = isDragging ? baseTop + dragOffset : baseTop;
  const height = Math.max(block.durationMinutes * MIN_PER_PX, 28);
  const color = getCategoryColor(block.category as Category);
  const completed = !!block.isCompleted;
  const isLongPressRef = useRef(false);
  const didDragRef = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedRef = useRef(block.isLocked);
  lockedRef.current = block.isLocked;

  const rawDragStart = block.startMinutes + Math.round(dragOffset / MIN_PER_PX);
  const snappedStart = snapToInterval(rawDragStart);
  const clampedStart = Math.max(wakeMinutes, Math.min(sleepMinutes - block.durationMinutes, snappedStart));
  const displayStartMin = isDragging ? clampedStart : block.startMinutes;
  const displayEndMin = displayStartMin + block.durationMinutes;

  const callbackRefs = useRef({ onDragStart, onDragMove, onDragEnd });
  callbackRefs.current = { onDragStart, onDragMove, onDragEnd };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        if (lockedRef.current) return false;
        return isLongPressRef.current && Math.abs(gestureState.dy) > 2;
      },
      onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
        if (lockedRef.current) return false;
        return isLongPressRef.current && Math.abs(gestureState.dy) > 2;
      },
      onPanResponderGrant: () => {
        didDragRef.current = true;
        callbackRefs.current.onDragStart(block.id);
      },
      onPanResponderMove: (_evt, gestureState) => {
        callbackRefs.current.onDragMove(block.id, gestureState.dy);
      },
      onPanResponderRelease: () => {
        isLongPressRef.current = false;
        callbackRefs.current.onDragEnd(block.id);
      },
      onPanResponderTerminate: () => {
        isLongPressRef.current = false;
        callbackRefs.current.onDragEnd(block.id);
      },
    })
  ).current;

  const handleLongPress = () => {
    if (block.isLocked) return;
    isLongPressRef.current = true;
    didDragRef.current = false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const handlePress = () => {
    if (didDragRef.current) return;
    scale.value = withSpring(0.97, {}, () => {
      scale.value = withSpring(1);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(block);
  };

  const handleComplete = (e: any) => {
    e.stopPropagation();
    didDragRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggleComplete(block.id);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.block,
        animStyle,
        {
          top,
          height,
          left: LEFT_GUTTER + 4,
          right: 8,
          borderLeftColor: completed ? Colors.theme.textMuted : color,
          backgroundColor: completed ? `${Colors.theme.textMuted}10` : `${color}18`,
          borderColor: completed
            ? `${Colors.theme.textMuted}30`
            : block.isLocked
            ? color
            : `${color}50`,
          zIndex: isDragging ? 100 : 1,
          opacity: isDragging ? 0.9 : 1,
          ...(isDragging ? {
            ...(Platform.OS === "web"
              ? { boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }
              : { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }),
            elevation: 8,
            transform: [{ scale: 1.03 }],
          } : {}),
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={300}
        style={styles.blockInner}
      >
        <View style={styles.blockTop}>
          <Pressable
            onPress={handleComplete}
            hitSlop={8}
            testID={`check-${block.id}`}
            style={[
              styles.checkBtn,
              {
                borderColor: completed ? Colors.palette.green : `${color}60`,
                backgroundColor: completed ? Colors.palette.green : "transparent",
              },
            ]}
          >
            {completed && <Feather name="check" size={10} color="#fff" />}
          </Pressable>
          <Text
            style={[
              styles.blockTitle,
              {
                color: completed ? Colors.theme.textMuted : Colors.theme.text,
                textDecorationLine: completed ? "line-through" : "none",
              },
            ]}
            numberOfLines={height < 50 ? 1 : 2}
          >
            {block.title}
          </Text>
          <View style={styles.blockIcons}>
            {!block.isLocked && !isDragging && (
              <Feather name="move" size={10} color={Colors.theme.textMuted} />
            )}
            {block.isLocked && (
              <Feather name="lock" size={10} color={color} />
            )}
          </View>
        </View>
        {height >= 48 && (
          <Text style={styles.blockTime}>
            {minutesToTimeShort(displayStartMin)} –{" "}
            {minutesToTimeShort(displayEndMin)}
          </Text>
        )}
        {isDragging && (
          <View style={styles.dragTimeTooltip}>
            <Text style={styles.dragTimeText}>
              {minutesToTimeShort(displayStartMin)} – {minutesToTimeShort(displayEndMin)}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function NowIndicator({ wakeMinutes }: { wakeMinutes: number }) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const top = (nowMinutes - wakeMinutes) * MIN_PER_PX;
  if (top < 0) return null;

  return (
    <View style={[styles.nowLine, { top }]}>
      <View style={styles.nowDot} />
      <View style={styles.nowLineBar} />
    </View>
  );
}

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const {
    currentSchedule,
    updateBlock,
    toggleLock,
    toggleComplete,
    setCurrentSchedule,
    settings,
    learnedTasks,
    recordTaskCompletion,
  } = useSchedule();

  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [editDuration, setEditDuration] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [containerWidth, setContainerWidth] = useState(350);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);
  const dragDyRef = useRef(0);
  const scrollEnabled = draggingBlockId === null;

  const blocks = currentSchedule?.blocks ?? [];
  const wakeMinutes = currentSchedule?.wakeMinutes ?? 420;
  const sleepMinutes = currentSchedule?.sleepMinutes ?? 1380;
  const totalHeight = (sleepMinutes - wakeMinutes) * MIN_PER_PX;

  const hourMarkers = useMemo(() => {
    const markers = [];
    const startHour = Math.floor(wakeMinutes / 60);
    const endHour = Math.ceil(sleepMinutes / 60);
    for (let h = startHour; h <= endHour; h++) {
      const min = h * 60;
      if (min >= wakeMinutes && min <= sleepMinutes) {
        markers.push({ hour: h, top: (min - wakeMinutes) * MIN_PER_PX });
      }
    }
    return markers;
  }, [wakeMinutes, sleepMinutes]);

  const { busyMinutes, freeMinutes, completed, totalTasks } = useMemo(() => {
    const taskBlocks = blocks.filter((b) => !b.isBuffer);
    const busy = taskBlocks.reduce((acc, b) => acc + b.durationMinutes, 0);
    const total = sleepMinutes - wakeMinutes;
    const completed = taskBlocks.filter((b) => !!b.isCompleted).length;
    const totalTasks = taskBlocks.length;
    return {
      busyMinutes: busy,
      freeMinutes: Math.max(0, total - busy),
      completed,
      totalTasks,
    };
  }, [blocks, wakeMinutes, sleepMinutes]);

  const handleDragStart = useCallback((blockId: string) => {
    setDraggingBlockId(blockId);
    setDragDy(0);
  }, []);

  const handleDragMove = useCallback((_blockId: string, dy: number) => {
    dragDyRef.current = dy;
    setDragDy(dy);
  }, []);

  const handleDragEnd = useCallback((blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    const currentDy = dragDyRef.current;
    if (block && currentDy !== 0) {
      const deltaMinutes = Math.round(currentDy / MIN_PER_PX);
      const rawNewStart = block.startMinutes + deltaMinutes;
      const snapped = snapToInterval(rawNewStart);
      const newStart = Math.max(wakeMinutes, Math.min(sleepMinutes - block.durationMinutes, snapped));
      if (newStart !== block.startMinutes) {
        updateBlock(blockId, {
          startMinutes: newStart,
          endMinutes: newStart + block.durationMinutes,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    dragDyRef.current = 0;
    setDraggingBlockId(null);
    setDragDy(0);
  }, [blocks, wakeMinutes, sleepMinutes, updateBlock]);

  const openEdit = (block: TimeBlock) => {
    if (draggingBlockId) return;
    setEditingBlock(block);
    setEditDuration(String(block.durationMinutes));
    setEditStartTime(minutesToInputFormat(block.startMinutes));
    setEditEndTime(minutesToInputFormat(block.endMinutes));
  };

  const saveEdit = () => {
    if (!editingBlock) return;

    const newStart = parseTimeInput(editStartTime);
    const newEnd = parseTimeInput(editEndTime);

    if (newStart === null || newEnd === null) {
      Alert.alert("Invalid time", "Use format like 9:00 AM or 1:30 PM");
      return;
    }

    if (newEnd <= newStart) {
      Alert.alert("Invalid time", "End time must be after start time");
      return;
    }

    if (newStart < wakeMinutes || newEnd > sleepMinutes) {
      Alert.alert("Out of range", `Times must be between ${minutesToTimeShort(wakeMinutes)} and ${minutesToTimeShort(sleepMinutes)}`);
      return;
    }

    const dur = newEnd - newStart;
    if (dur < 5) {
      Alert.alert("Too short", "Task must be at least 5 minutes");
      return;
    }

    updateBlock(editingBlock.id, {
      startMinutes: newStart,
      endMinutes: newEnd,
      durationMinutes: dur,
    });
    recordTaskCompletion(editingBlock.title, dur, newStart);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditingBlock(null);
  };

  const handleRegenerate = useCallback(async () => {
    if (!currentSchedule) return;
    setIsRegenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const lockedBlocks = blocks.filter((b) => b.isLocked);

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
          prompt: currentSchedule.prompt,
          wakeTime: `${String(Math.floor(wakeMinutes / 60)).padStart(2, "0")}:${String(wakeMinutes % 60).padStart(2, "0")}`,
          sleepTime: `${String(Math.floor(sleepMinutes / 60)).padStart(2, "0")}:${String(sleepMinutes % 60).padStart(2, "0")}`,
          bufferMinutes: settings.bufferMinutes,
          learnedTasks: learnedForApi,
        }),
      });

      if (!response.ok) throw new Error("Regeneration failed");
      const data = await response.json();

      const newBlocks: TimeBlock[] = data.blocks
        .filter(
          (b: TimeBlock) =>
            !lockedBlocks.some((lb) => lb.taskId === b.taskId)
        )
        .map((b: TimeBlock) => ({ ...b, isLocked: false }));

      const allBlocks = [...lockedBlocks, ...newBlocks].sort(
        (a, b) => a.startMinutes - b.startMinutes
      );

      setCurrentSchedule({
        ...currentSchedule,
        id: generateId(),
        blocks: allBlocks,
        generatedAt: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Error", "Could not regenerate schedule.");
    } finally {
      setIsRegenerating(false);
    }
  }, [currentSchedule, blocks, learnedTasks, settings, wakeMinutes, sleepMinutes, setCurrentSchedule]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  if (!currentSchedule || blocks.length === 0) {
    return (
      <LinearGradient
        colors={[Colors.theme.bg0, Colors.theme.bg1]}
        style={{ flex: 1 }}
      >
        <View
          style={[styles.emptyContainer, { paddingTop: topPad + 20 }]}
        >
          <Feather name="calendar" size={48} color={Colors.theme.textMuted} />
          <Text style={styles.emptyTitle}>No Schedule Yet</Text>
          <Text style={styles.emptyText}>
            Go to Today and describe what you need to do. Your time-blocked plan will appear here.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[Colors.theme.bg0, Colors.theme.bg1]}
      style={{ flex: 1 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Today's Plan</Text>
          <Text style={styles.headerDate}>
            {new Date(currentSchedule.date).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </Text>
        </View>
        <Pressable
          onPress={handleRegenerate}
          disabled={isRegenerating}
          style={({ pressed }) => [
            styles.regenBtn,
            { opacity: pressed || isRegenerating ? 0.7 : 1 },
          ]}
        >
          {isRegenerating ? (
            <ActivityIndicator size="small" color={Colors.palette.blue} />
          ) : (
            <Feather name="refresh-cw" size={16} color={Colors.palette.blue} />
          )}
          <Text style={styles.regenText}>
            {isRegenerating ? "..." : "Regen"}
          </Text>
        </Pressable>
      </View>

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Feather name="check-circle" size={12} color={Colors.palette.green} />
          <Text style={styles.summaryLabel}>Done</Text>
          <Text style={styles.summaryValue}>{completed}/{totalTasks}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: Colors.palette.blue }]} />
          <Text style={styles.summaryLabel}>Busy</Text>
          <Text style={styles.summaryValue}>{formatDuration(busyMinutes)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: Colors.palette.green }]} />
          <Text style={styles.summaryLabel}>Free</Text>
          <Text style={styles.summaryValue}>{formatDuration(freeMinutes)}</Text>
        </View>
      </View>

      {/* Timeline */}
      <ScrollView
        style={styles.timelineScroll}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 120 : 100 }}
      >
        <View
          style={[styles.timelineContainer, { height: totalHeight + 40 }]}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          {/* Hour markers */}
          {hourMarkers.map(({ hour, top }) => (
            <View key={hour} style={[styles.hourRow, { top }]}>
              <Text style={styles.hourLabel}>
                {hour === 12
                  ? "12 PM"
                  : hour === 0
                  ? "12 AM"
                  : hour > 12
                  ? `${hour - 12} PM`
                  : `${hour} AM`}
              </Text>
              <View style={styles.hourLine} />
            </View>
          ))}

          {/* Now indicator */}
          <NowIndicator wakeMinutes={wakeMinutes} />

          {/* Blocks */}
          {blocks.map((block) => (
            <BlockItem
              key={block.id}
              block={block}
              wakeMinutes={wakeMinutes}
              sleepMinutes={sleepMinutes}
              containerWidth={containerWidth}
              onPress={openEdit}
              onToggleComplete={toggleComplete}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              isDragging={draggingBlockId === block.id}
              dragOffset={draggingBlockId === block.id ? dragDy : 0}
            />
          ))}
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={!!editingBlock}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingBlock(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setEditingBlock(null)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
            {editingBlock && (
              <>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <View
                    style={[
                      styles.modalCategoryDot,
                      { backgroundColor: getCategoryColor(editingBlock.category as Category) },
                    ]}
                  />
                  <Text style={styles.modalTitle}>{editingBlock.title}</Text>
                  <Pressable
                    onPress={() => {
                      toggleLock(editingBlock.id);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setEditingBlock(null);
                    }}
                    style={({ pressed }) => [
                      styles.lockBtn,
                      {
                        backgroundColor: editingBlock.isLocked
                          ? `${Colors.palette.amber}30`
                          : Colors.theme.bg3,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name={editingBlock.isLocked ? "lock" : "unlock"}
                      size={14}
                      color={
                        editingBlock.isLocked
                          ? Colors.palette.amber
                          : Colors.theme.textSub
                      }
                    />
                  </Pressable>
                </View>

                <View style={styles.modalInfo}>
                  <View style={styles.infoRow}>
                    <Feather name="tag" size={14} color={Colors.theme.textMuted} />
                    <Text style={styles.infoText}>{editingBlock.category}</Text>
                    <View
                      style={[
                        styles.priorityBadge,
                        {
                          backgroundColor:
                            editingBlock.priority === "high"
                              ? `${Colors.palette.red}25`
                              : editingBlock.priority === "medium"
                              ? `${Colors.palette.amber}25`
                              : `${Colors.theme.textMuted}25`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityText,
                          {
                            color:
                              editingBlock.priority === "high"
                                ? Colors.palette.red
                                : editingBlock.priority === "medium"
                                ? Colors.palette.amber
                                : Colors.theme.textMuted,
                          },
                        ]}
                      >
                        {editingBlock.priority} priority
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.editSection}>
                  <Text style={styles.editLabel}>Start Time</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editStartTime}
                    onChangeText={(text) => {
                      setEditStartTime(text);
                      const s = parseTimeInput(text);
                      const e = parseTimeInput(editEndTime);
                      if (s !== null && e !== null && e > s) {
                        setEditDuration(String(e - s));
                      }
                    }}
                    placeholder="e.g. 9:00 AM"
                    placeholderTextColor={Colors.theme.textMuted}
                    autoCapitalize="characters"
                    selectTextOnFocus
                  />
                </View>

                <View style={styles.editSection}>
                  <Text style={styles.editLabel}>End Time</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editEndTime}
                    onChangeText={(text) => {
                      setEditEndTime(text);
                      const s = parseTimeInput(editStartTime);
                      const e = parseTimeInput(text);
                      if (s !== null && e !== null && e > s) {
                        setEditDuration(String(e - s));
                      }
                    }}
                    placeholder="e.g. 10:30 AM"
                    placeholderTextColor={Colors.theme.textMuted}
                    autoCapitalize="characters"
                    selectTextOnFocus
                  />
                </View>

                {(() => {
                  const s = parseTimeInput(editStartTime);
                  const e = parseTimeInput(editEndTime);
                  const dur = s !== null && e !== null && e > s ? e - s : null;
                  return (
                    <View style={styles.durationHint}>
                      <Feather name="clock" size={13} color={dur !== null ? Colors.palette.blue : Colors.theme.textMuted} />
                      <Text style={[styles.durationHintText, { color: dur !== null ? Colors.theme.textSub : Colors.theme.textMuted }]}>
                        {dur !== null ? `Duration: ${formatDuration(dur)}` : "Set valid start & end times"}
                      </Text>
                    </View>
                  );
                })()}

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setEditingBlock(null)}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      styles.cancelBtn,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveEdit}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      { opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <LinearGradient
                      colors={[Colors.palette.blue, Colors.palette.blueDim]}
                      style={styles.saveGradient}
                    >
                      <Text style={styles.saveBtnText}>Save</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    color: Colors.theme.text,
  },
  emptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.theme.textSub,
    textAlign: "center",
    lineHeight: 22,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerLeft: {
    gap: 2,
  },
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 24,
    color: Colors.theme.text,
    letterSpacing: -0.3,
  },
  headerDate: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.theme.textSub,
  },
  regenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: `${Colors.palette.blue}18`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.palette.blue}40`,
  },
  regenText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: Colors.palette.blue,
  },
  summaryBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: Colors.theme.bg1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.theme.border,
    padding: 12,
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.theme.textSub,
  },
  summaryValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    color: Colors.theme.text,
  },
  summaryDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.theme.border,
  },
  timelineScroll: {
    flex: 1,
  },
  timelineContainer: {
    position: "relative",
    marginLeft: 0,
  },
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  hourLabel: {
    width: LEFT_GUTTER,
    paddingLeft: 16,
    fontFamily: "DMMono_400Regular",
    fontSize: 10,
    color: Colors.theme.textMuted,
    textAlign: "right",
    paddingRight: 8,
  },
  hourLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.theme.border,
  },
  block: {
    position: "absolute",
    borderRadius: 10,
    borderWidth: 1,
    borderLeftWidth: 3,
    overflow: "hidden",
  },
  blockInner: {
    flex: 1,
    padding: 7,
    justifyContent: "center",
    gap: 2,
  },
  blockTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },
  checkBtn: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
  },
  blockTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  blockIcons: {
    flexDirection: "row",
    gap: 4,
  },
  blockTime: {
    fontFamily: "DMMono_400Regular",
    fontSize: 10,
    color: Colors.theme.textMuted,
  },
  dragTimeTooltip: {
    position: "absolute",
    top: -24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dragTimeText: {
    fontFamily: "DMMono_400Regular",
    fontSize: 11,
    color: Colors.palette.blue,
    backgroundColor: `${Colors.palette.blue}18`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  nowLine: {
    position: "absolute",
    left: LEFT_GUTTER,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.palette.red,
    marginLeft: -4,
  },
  nowLineBar: {
    flex: 1,
    height: 1.5,
    backgroundColor: Colors.palette.red,
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
    gap: 16,
    borderTopWidth: 1,
    borderColor: Colors.theme.border,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.theme.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalCategoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modalTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
    color: Colors.theme.text,
    flex: 1,
  },
  lockBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalInfo: {
    gap: 8,
    backgroundColor: Colors.theme.bg2,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.theme.border,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.theme.textSub,
    flex: 1,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priorityText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
  },
  editSection: {
    gap: 8,
  },
  editLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: Colors.theme.textSub,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editInput: {
    backgroundColor: Colors.theme.bg2,
    borderRadius: 12,
    padding: 14,
    color: Colors.theme.text,
    fontFamily: "DMMono_400Regular",
    fontSize: 18,
    borderWidth: 1,
    borderColor: Colors.theme.border,
  },
  durationHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  durationHintText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  cancelBtn: {
    backgroundColor: Colors.theme.bg3,
    alignItems: "center",
    justifyContent: "center",
    height: 50,
  },
  cancelBtnText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.theme.textSub,
  },
  saveGradient: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
    color: "#fff",
  },
});
