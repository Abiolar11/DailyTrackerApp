import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
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
import { TimeBlock, Category, Priority, Schedule } from "@/types/schedule";
import Colors from "@/constants/colors";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { fetch } from "expo/fetch";

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

function minutesToPicker(minutes: number): { hour: number; minute: number; period: "AM" | "PM" } {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour, minute: m, period };
}

function pickerToMinutes(hour: number, minute: number, period: "AM" | "PM"): number {
  let h24 = hour;
  if (period === "AM" && hour === 12) h24 = 0;
  else if (period === "PM" && hour !== 12) h24 = hour + 12;
  return h24 * 60 + minute;
}

const PICKER_HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PICKER_MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function SpinnerSegment<T extends string | number>({
  data,
  selected,
  onSelect,
  format,
}: {
  data: T[];
  selected: T;
  onSelect: (val: T) => void;
  format?: (val: T) => string;
}) {
  const idx = data.indexOf(selected);
  const prev = () => {
    const next = idx <= 0 ? data.length - 1 : idx - 1;
    Haptics.selectionAsync();
    onSelect(data[next]);
  };
  const next = () => {
    const n = idx >= data.length - 1 ? 0 : idx + 1;
    Haptics.selectionAsync();
    onSelect(data[n]);
  };

  return (
    <View style={pickerStyles.segment}>
      <Pressable onPress={prev} style={pickerStyles.arrow} hitSlop={8}>
        <Feather name="chevron-up" size={16} color={Colors.theme.textMuted} />
      </Pressable>
      <Text style={pickerStyles.segValue}>
        {format ? format(selected) : String(selected)}
      </Text>
      <Pressable onPress={next} style={pickerStyles.arrow} hitSlop={8}>
        <Feather name="chevron-down" size={16} color={Colors.theme.textMuted} />
      </Pressable>
    </View>
  );
}

function TimeSpinnerPicker({
  minutes,
  onChange,
  label,
}: {
  minutes: number;
  onChange: (m: number) => void;
  label: string;
}) {
  const { hour, minute, period } = minutesToPicker(minutes);

  const setHour = (h: number) => onChange(pickerToMinutes(h, minute, period));
  const setMinute = (m: number) => onChange(pickerToMinutes(hour, m, period));
  const togglePeriod = () => {
    Haptics.selectionAsync();
    onChange(pickerToMinutes(hour, minute, period === "AM" ? "PM" : "AM"));
  };

  return (
    <View style={pickerStyles.wrapper}>
      <Text style={pickerStyles.label}>{label}</Text>
      <View style={pickerStyles.row}>
        <SpinnerSegment data={PICKER_HOURS} selected={hour} onSelect={setHour} />
        <Text style={pickerStyles.colon}>:</Text>
        <SpinnerSegment
          data={PICKER_MINUTES}
          selected={minute}
          onSelect={setMinute}
          format={(v) => String(v).padStart(2, "0")}
        />
        <Pressable onPress={togglePeriod} style={pickerStyles.periodBtn}>
          <Text style={pickerStyles.periodText}>{period}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: Colors.theme.textSub,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.theme.bg2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.theme.border,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  segment: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  arrow: {
    padding: 2,
  },
  segValue: {
    fontFamily: "DMMono_500Medium",
    fontSize: 22,
    color: Colors.theme.text,
    minWidth: 32,
    textAlign: "center",
  },
  colon: {
    fontFamily: "DMMono_500Medium",
    fontSize: 22,
    color: Colors.theme.textSub,
    marginBottom: 2,
  },
  periodBtn: {
    backgroundColor: `${Colors.palette.blue}20`,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 6,
  },
  periodText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    color: Colors.palette.blue,
  },
});

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
        setTimeout(() => { didDragRef.current = false; }, 300);
      },
      onPanResponderTerminate: () => {
        isLongPressRef.current = false;
        callbackRefs.current.onDragEnd(block.id);
        setTimeout(() => { didDragRef.current = false; }, 300);
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
    setTimeout(() => { didDragRef.current = false; }, 300);
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

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const {
    currentSchedule,
    updateBlock,
    toggleLock,
    toggleComplete,
    setCurrentSchedule,
    addBlock,
    removeBlock,
    settings,
    learnedTasks,
    recordTaskCompletion,
    scheduleHistory,
  } = useSchedule();

  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [editStartMin, setEditStartMin] = useState(0);
  const [editEndMin, setEditEndMin] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustInstruction, setAdjustInstruction] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addCategory, setAddCategory] = useState<Category>("other");
  const [addPriority, setAddPriority] = useState<Priority>("medium");
  const [addStartMin, setAddStartMin] = useState(540);
  const [addEndMin, setAddEndMin] = useState(600);
  const [containerWidth, setContainerWidth] = useState(350);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);
  const dragDyRef = useRef(0);
  const scrollEnabled = draggingBlockId === null;
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const [viewSchedule, setViewSchedule] = useState<Schedule | null>(null);
  const [loadingDate, setLoadingDate] = useState(false);

  const todayStr = formatDateISO(new Date());
  const viewDateStr = formatDateISO(viewDate);
  const isViewingCurrent = currentSchedule?.date === viewDateStr;
  const isViewingToday = viewDateStr === todayStr;
  const displaySchedule = isViewingCurrent ? currentSchedule : viewSchedule;

  useEffect(() => {
    if (!isViewingCurrent) {
      const found = scheduleHistory.find((s) => s.date === viewDateStr);
      if (found) {
        setViewSchedule(found);
        setLoadingDate(false);
      } else {
        setLoadingDate(true);
        const requestDate = viewDateStr;
        (async () => {
          try {
            const baseUrl = getApiUrl();
            const res = await fetch(new URL(`/api/schedules/${requestDate}`, baseUrl).toString(), { credentials: "include" });
            if (requestDate !== formatDateISO(viewDate)) return;
            if (res.ok) {
              const data = await res.json();
              setViewSchedule(data);
            } else {
              setViewSchedule(null);
            }
          } catch {
            if (requestDate === formatDateISO(viewDate)) {
              setViewSchedule(null);
            }
          } finally {
            setLoadingDate(false);
          }
        })();
      }
    } else {
      setViewSchedule(null);
    }
  }, [viewDateStr, isViewingCurrent, scheduleHistory]);

  useEffect(() => {
    if (currentSchedule) {
      const scheduleDate = new Date(currentSchedule.date + "T00:00:00");
      setViewDate(scheduleDate);
    }
  }, [currentSchedule?.id]);

  const navigateDate = useCallback((offset: number) => {
    setViewDate((prev) => addDays(prev, offset));
  }, []);

  const blocks = displaySchedule?.blocks ?? [];
  const wakeMinutes = displaySchedule?.wakeMinutes ?? 420;
  const sleepMinutes = displaySchedule?.sleepMinutes ?? 1380;
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
    const snapTo5 = (m: number) => Math.round(m / 5) * 5;
    setEditStartMin(snapTo5(block.startMinutes));
    setEditEndMin(snapTo5(block.endMinutes));
  };

  const editDuration = editEndMin > editStartMin ? editEndMin - editStartMin : 0;

  const saveEdit = () => {
    if (!editingBlock) return;

    if (editEndMin <= editStartMin) {
      Alert.alert("Invalid time", "End time must be after start time");
      return;
    }

    if (editStartMin < wakeMinutes || editEndMin > sleepMinutes) {
      Alert.alert("Out of range", `Times must be between ${minutesToTimeShort(wakeMinutes)} and ${minutesToTimeShort(sleepMinutes)}`);
      return;
    }

    const dur = editEndMin - editStartMin;
    if (dur < 5) {
      Alert.alert("Too short", "Task must be at least 5 minutes");
      return;
    }

    updateBlock(editingBlock.id, {
      startMinutes: editStartMin,
      endMinutes: editEndMin,
      durationMinutes: dur,
    });
    recordTaskCompletion(editingBlock.title, dur, editStartMin);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditingBlock(null);
  };

  const openAddModal = () => {
    const now = new Date();
    const currentMin = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
    const startMin = Math.max(wakeMinutes, Math.min(currentMin, sleepMinutes - 30));
    setAddTitle("");
    setAddCategory("other");
    setAddPriority("medium");
    setAddStartMin(startMin);
    setAddEndMin(Math.min(startMin + 60, sleepMinutes));
    setShowAddModal(true);
  };

  const saveNewTask = () => {
    const title = addTitle.trim();
    if (!title) {
      Alert.alert("Missing title", "Please enter a task name");
      return;
    }
    if (addEndMin <= addStartMin) {
      Alert.alert("Invalid time", "End time must be after start time");
      return;
    }
    if (addStartMin < wakeMinutes || addEndMin > sleepMinutes) {
      Alert.alert("Out of range", `Times must be between ${minutesToTimeShort(wakeMinutes)} and ${minutesToTimeShort(sleepMinutes)}`);
      return;
    }
    const dur = addEndMin - addStartMin;
    const id = `block_manual_${generateId()}`;
    const newBlock: TimeBlock = {
      id,
      taskId: id,
      title,
      category: addCategory,
      priority: addPriority,
      startMinutes: addStartMin,
      endMinutes: addEndMin,
      durationMinutes: dur,
      isLocked: false,
      isBuffer: false,
      isCompleted: false,
      flexibility: "high",
    };
    addBlock(newBlock);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAddModal(false);
  };

  const deleteEditingBlock = () => {
    if (!editingBlock) return;
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Remove "${editingBlock.title}" from your schedule?`);
      if (confirmed) {
        removeBlock(editingBlock.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setEditingBlock(null);
      }
    } else {
      Alert.alert("Remove Task", `Remove "${editingBlock.title}" from your schedule?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            removeBlock(editingBlock.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setEditingBlock(null);
          },
        },
      ]);
    }
  };

  const handleAdjust = useCallback(async () => {
    if (!currentSchedule || !adjustInstruction.trim()) return;
    setIsRegenerating(true);
    setShowAdjustModal(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/modify-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: adjustInstruction.trim(),
          currentBlocks: blocks,
          wakeTime: `${String(Math.floor(wakeMinutes / 60)).padStart(2, "0")}:${String(wakeMinutes % 60).padStart(2, "0")}`,
          sleepTime: `${String(Math.floor(sleepMinutes / 60)).padStart(2, "0")}:${String(sleepMinutes % 60).padStart(2, "0")}`,
          bufferMinutes: settings.bufferMinutes,
        }),
      });

      if (!response.ok) throw new Error("Modification failed");
      const data = await response.json();

      const newBlocks: TimeBlock[] = data.blocks.map((b: TimeBlock) => ({
        ...b,
        isLocked: false,
        isCompleted: false,
      }));

      const lockedBlocks = blocks.filter((b) => b.isLocked);
      const mergedBlocks = [
        ...lockedBlocks,
        ...newBlocks.filter((nb) => !lockedBlocks.some((lb) => lb.title.toLowerCase() === nb.title.toLowerCase())),
      ].sort((a, b) => a.startMinutes - b.startMinutes);

      setCurrentSchedule({
        ...currentSchedule,
        id: generateId(),
        blocks: mergedBlocks,
        generatedAt: new Date().toISOString(),
      });

      setAdjustInstruction("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Error", "Could not modify schedule. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  }, [currentSchedule, adjustInstruction, blocks, settings, wakeMinutes, sleepMinutes, setCurrentSchedule]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  if (loadingDate) {
    return (
      <LinearGradient colors={[Colors.theme.bg0, Colors.theme.bg1]} style={{ flex: 1 }}>
        <View style={[styles.emptyContainer, { paddingTop: topPad + 20 }]}>
          <ActivityIndicator size="large" color={Colors.palette.blue} />
          <Text style={styles.emptyText}>Loading schedule...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!displaySchedule || blocks.length === 0) {
    return (
      <LinearGradient
        colors={[Colors.theme.bg0, Colors.theme.bg1]}
        style={{ flex: 1 }}
      >
        <View style={[styles.header, { paddingTop: topPad + 8 }]}>
          <View style={styles.headerLeft}>
            <View style={styles.dateNav}>
              <Pressable onPress={() => navigateDate(-1)} style={styles.dateNavBtn} hitSlop={12}>
                <Feather name="chevron-left" size={20} color={Colors.theme.textSub} />
              </Pressable>
              <Pressable onPress={() => setViewDate(new Date())} hitSlop={8}>
                <Text style={styles.headerTitle}>
                  {viewDateStr === todayStr ? "Today" : viewDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
                <Text style={styles.headerDate}>
                  {viewDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </Text>
              </Pressable>
              <Pressable onPress={() => navigateDate(1)} style={styles.dateNavBtn} hitSlop={12}>
                <Feather name="chevron-right" size={20} color={Colors.theme.textSub} />
              </Pressable>
            </View>
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <Feather name="calendar" size={48} color={Colors.theme.textMuted} />
          <Text style={styles.emptyTitle}>No Schedule</Text>
          <Text style={styles.emptyText}>
            {viewDateStr === todayStr
              ? "Go to Today and describe what you need to do. Your time-blocked plan will appear here."
              : `No schedule found for ${viewDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}. Navigate to another date or go to Today to create one.`}
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
          <View style={styles.dateNav}>
            <Pressable onPress={() => navigateDate(-1)} style={styles.dateNavBtn} hitSlop={12}>
              <Feather name="chevron-left" size={20} color={Colors.theme.textSub} />
            </Pressable>
            <Pressable onPress={() => setViewDate(new Date())} hitSlop={8}>
              <Text style={styles.headerTitle}>
                {viewDateStr === todayStr ? "Today's Plan" : viewDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
              <Text style={styles.headerDate}>
                {viewDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </Text>
            </Pressable>
            <Pressable onPress={() => navigateDate(1)} style={styles.dateNavBtn} hitSlop={12}>
              <Feather name="chevron-right" size={20} color={Colors.theme.textSub} />
            </Pressable>
          </View>
        </View>
        {isViewingCurrent && (
        <Pressable
          onPress={() => { setAdjustInstruction(""); setShowAdjustModal(true); }}
          disabled={isRegenerating}
          style={({ pressed }) => [
            styles.regenBtn,
            { opacity: pressed || isRegenerating ? 0.7 : 1 },
          ]}
        >
          {isRegenerating ? (
            <ActivityIndicator size="small" color={Colors.palette.blue} />
          ) : (
            <Feather name="edit-3" size={16} color={Colors.palette.blue} />
          )}
          <Text style={styles.regenText}>
            {isRegenerating ? "Adjusting..." : "Adjust"}
          </Text>
        </Pressable>
        )}
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

                <TimeSpinnerPicker
                  minutes={editStartMin}
                  onChange={setEditStartMin}
                  label="Start Time"
                />

                <TimeSpinnerPicker
                  minutes={editEndMin}
                  onChange={setEditEndMin}
                  label="End Time"
                />

                <View style={styles.durationHint}>
                  <Feather name="clock" size={13} color={editDuration > 0 ? Colors.palette.blue : Colors.theme.textMuted} />
                  <Text style={[styles.durationHintText, { color: editDuration > 0 ? Colors.theme.textSub : Colors.theme.textMuted }]}>
                    {editDuration > 0 ? `Duration: ${formatDuration(editDuration)}` : "End must be after start"}
                  </Text>
                </View>

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={deleteEditingBlock}
                    style={({ pressed }) => [
                      styles.deleteBtn,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Feather name="trash-2" size={18} color={Colors.palette.red} />
                  </Pressable>
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

      {/* Add Task FAB */}
      {isViewingCurrent && (
      <Pressable
        onPress={openAddModal}
        style={({ pressed }) => [
          styles.fab,
          { bottom: (Platform.OS === "web" ? 90 : insets.bottom + 16), opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <LinearGradient
          colors={[Colors.palette.blue, Colors.palette.blueDim]}
          style={styles.fabGradient}
        >
          <Feather name="plus" size={24} color="#fff" />
        </LinearGradient>
      </Pressable>
      )}

      {/* Adjust Schedule Modal */}
      <Modal
        visible={showAdjustModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdjustModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setShowAdjustModal(false)} />
          <View style={styles.adjustModalContent}>
            <View style={styles.adjustModalHandle} />
            <Text style={styles.modalTitle}>Adjust Schedule</Text>
            <Text style={[styles.settingLabel, { marginBottom: 8, textTransform: "none", letterSpacing: 0 }]}>
              Describe what you'd like to change
            </Text>
            <TextInput
              style={styles.adjustInput}
              value={adjustInstruction}
              onChangeText={setAdjustInstruction}
              multiline
              placeholder="e.g. Move gym to 6pm, add a 30min lunch break at noon..."
              placeholderTextColor={Colors.theme.textMuted}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowAdjustModal(false)}
                style={({ pressed }) => [styles.modalCancelBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAdjust}
                disabled={!adjustInstruction.trim()}
                style={({ pressed }) => [
                  styles.modalSaveBtn,
                  { opacity: pressed || !adjustInstruction.trim() ? 0.5 : 1 },
                ]}
              >
                <LinearGradient
                  colors={[Colors.palette.blue, Colors.palette.blueDim]}
                  style={styles.modalSaveGradient}
                >
                  <Feather name="zap" size={16} color="#fff" />
                  <Text style={styles.modalSaveText}>Apply</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Task Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAddModal(false)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Feather name="plus-circle" size={18} color={Colors.palette.blue} />
              <Text style={styles.modalTitle}>Add Task</Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.addLabel}>Task Name</Text>
              <TextInput
                style={styles.addInput}
                value={addTitle}
                onChangeText={setAddTitle}
                placeholder="What do you need to do?"
                placeholderTextColor={Colors.theme.textMuted}
                autoFocus
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.addLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                <View style={styles.chipRow}>
                  {(["work", "health", "personal", "learning", "social", "rest", "other"] as Category[]).map((cat) => (
                    <Pressable
                      key={cat}
                      onPress={() => { setAddCategory(cat); Haptics.selectionAsync(); }}
                      style={[
                        styles.chip,
                        addCategory === cat && { backgroundColor: getCategoryColor(cat), borderColor: getCategoryColor(cat) },
                      ]}
                    >
                      <Text style={[styles.chipText, addCategory === cat && { color: "#fff" }]}>{cat}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.addLabel}>Priority</Text>
              <View style={styles.chipRow}>
                {(["low", "medium", "high"] as Priority[]).map((p) => {
                  const pColor = p === "high" ? Colors.palette.red : p === "medium" ? Colors.palette.amber : Colors.theme.textMuted;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => { setAddPriority(p); Haptics.selectionAsync(); }}
                      style={[styles.chip, addPriority === p && { backgroundColor: pColor, borderColor: pColor }]}
                    >
                      <Text style={[styles.chipText, addPriority === p && { color: "#fff" }]}>{p}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <TimeSpinnerPicker
              minutes={addStartMin}
              onChange={setAddStartMin}
              label="Start Time"
            />
            <TimeSpinnerPicker
              minutes={addEndMin}
              onChange={setAddEndMin}
              label="End Time"
            />

            <View style={styles.durationHint}>
              <Feather name="clock" size={13} color={addEndMin > addStartMin ? Colors.palette.blue : Colors.theme.textMuted} />
              <Text style={[styles.durationHintText, { color: addEndMin > addStartMin ? Colors.theme.textSub : Colors.theme.textMuted }]}>
                {addEndMin > addStartMin ? `Duration: ${formatDuration(addEndMin - addStartMin)}` : "End must be after start"}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowAddModal(false)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.cancelBtn,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveNewTask}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <LinearGradient
                  colors={[Colors.palette.blue, Colors.palette.blueDim]}
                  style={styles.saveGradient}
                >
                  <Text style={styles.saveBtnText}>Add</Text>
                </LinearGradient>
              </Pressable>
            </View>
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
  adjustModalContent: {
    backgroundColor: Colors.theme.bg1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "web" ? 20 : 34,
    borderTopWidth: 1,
    borderColor: Colors.theme.border,
  },
  adjustModalHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.theme.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dateNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.theme.bg2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.theme.border,
  },
  adjustInput: {
    backgroundColor: Colors.theme.bg3,
    borderRadius: 12,
    padding: 14,
    color: Colors.theme.text,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: Colors.theme.border,
    textAlignVertical: "top" as const,
    marginBottom: 8,
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
  deleteBtn: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: `${Colors.palette.red}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    right: 20,
    zIndex: 50,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }
      : { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }),
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  addLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: Colors.theme.textSub,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addInput: {
    backgroundColor: Colors.theme.bg2,
    borderRadius: 12,
    padding: 14,
    color: Colors.theme.text,
    fontFamily: "DMSans_500Medium",
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.theme.border,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 4,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.theme.border,
    backgroundColor: Colors.theme.bg2,
  },
  chipText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: Colors.theme.textSub,
    textTransform: "capitalize",
  },
});
