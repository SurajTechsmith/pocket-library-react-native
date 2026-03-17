import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";

import {
    getSessionsLastNDays,
    getStreak,
    getTodayStats,
    getTotalStats,
} from "../db/queries";

// ── Heatmap ──────────────────────────────────────
function Heatmap() {
  const data = getSessionsLastNDays(105); // 15 weeks
  const max = Math.max(...data.map((d) => d.pages), 1);

  const CELL = 16;
  const GAP = 3;
  const COLS = 15;
  const ROWS = 7;
  const W = COLS * (CELL + GAP);
  const H = ROWS * (CELL + GAP);

  // split into columns of 7
  const cols: (typeof data)[] = [];
  for (let i = 0; i < data.length; i += 7) {
    cols.push(data.slice(i, i + 7));
  }

  function cellColor(pages: number) {
    if (pages === 0) return "#1a1a1a";
    const intensity = pages / max;
    if (intensity < 0.25) return "#78350f";
    if (intensity < 0.5) return "#b45309";
    if (intensity < 0.75) return "#d97706";
    return "#f59e0b";
  }

  return (
    <Svg width={W} height={H}>
      {cols.map((col, ci) =>
        col.map((day, ri) => (
          <Rect
            key={day.date}
            x={ci * (CELL + GAP)}
            y={ri * (CELL + GAP)}
            width={CELL}
            height={CELL}
            rx={3}
            fill={cellColor(day.pages)}
          />
        )),
      )}
    </Svg>
  );
}

// ── Stat card ─────────────────────────────────────
function StatCard({
  value,
  label,
  accent = "#f59e0b",
  emoji,
}: {
  value: string;
  label: string;
  accent?: string;
  emoji: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#111111",
        borderRadius: 16,
        padding: 16,
        borderWidth: 0.5,
        borderColor: "#1f1f1f",
      }}
    >
      <Text style={{ fontSize: 22, marginBottom: 8 }}>{emoji}</Text>
      <Text
        style={{
          color: accent,
          fontSize: 26,
          fontWeight: "700",
          letterSpacing: -0.5,
        }}
      >
        {value}
      </Text>
      <Text style={{ color: "#52525b", fontSize: 12, marginTop: 3 }}>
        {label}
      </Text>
    </View>
  );
}

export default function StatsScreen() {
  const [today, setToday] = useState({ pages: 0, seconds: 0 });
  const [streak, setStreak] = useState(0);
  const [totals, setTotals] = useState({
    totalBooks: 0,
    finishedBooks: 0,
    totalPages: 0,
    totalMinutes: 0,
  });

  useFocusEffect(
    useCallback(() => {
      setToday(getTodayStats());
      setStreak(getStreak());
      setTotals(getTotalStats());
    }, []),
  );

  const minutesToday = Math.round(today.seconds / 60);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View
          style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 }}
        >
          <Text
            style={{
              color: "#52525b",
              fontSize: 11,
              letterSpacing: 2,
              fontWeight: "500",
              marginBottom: 4,
            }}
          >
            YOUR PROGRESS
          </Text>
          <Text
            style={{
              color: "#ffffff",
              fontSize: 26,
              fontWeight: "700",
              letterSpacing: -0.5,
            }}
          >
            Reading Stats
          </Text>
        </View>

        {/* Streak banner */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <View
            style={{
              backgroundColor: streak > 0 ? "#f59e0b18" : "#111111",
              borderRadius: 20,
              borderWidth: 0.5,
              borderColor: streak > 0 ? "#f59e0b44" : "#1f1f1f",
              padding: 20,
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
            }}
          >
            <Text style={{ fontSize: 44 }}>{streak > 0 ? "🔥" : "💤"}</Text>
            <View>
              <Text
                style={{
                  color: streak > 0 ? "#f59e0b" : "#52525b",
                  fontSize: 36,
                  fontWeight: "800",
                  letterSpacing: -1,
                }}
              >
                {streak}
              </Text>
              <Text style={{ color: "#71717a", fontSize: 13 }}>
                {streak === 1 ? "day streak" : "day streak"}
                {streak === 0 ? " — read today to start!" : ""}
              </Text>
            </View>
          </View>
        </View>

        {/* Today row */}
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Text
            style={{
              color: "#52525b",
              fontSize: 11,
              letterSpacing: 1.5,
              fontWeight: "500",
              marginBottom: 10,
            }}
          >
            TODAY
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard
              emoji="📄"
              value={today.pages.toString()}
              label="Pages read"
              accent="#3b82f6"
            />
            <StatCard
              emoji="⏱️"
              value={`${minutesToday}m`}
              label="Minutes read"
              accent="#10b981"
            />
          </View>
        </View>

        {/* All time row */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text
            style={{
              color: "#52525b",
              fontSize: 11,
              letterSpacing: 1.5,
              fontWeight: "500",
              marginBottom: 10,
            }}
          >
            ALL TIME
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <StatCard
              emoji="📚"
              value={totals.totalBooks.toString()}
              label="Books added"
              accent="#8b5cf6"
            />
            <StatCard
              emoji="✅"
              value={totals.finishedBooks.toString()}
              label="Finished"
              accent="#10b981"
            />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard
              emoji="📖"
              value={totals.totalPages.toString()}
              label="Pages read"
              accent="#f59e0b"
            />
            <StatCard
              emoji="🕐"
              value={`${totals.totalMinutes}m`}
              label="Time reading"
              accent="#ec4899"
            />
          </View>
        </View>

        {/* Heatmap */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text
            style={{
              color: "#52525b",
              fontSize: 11,
              letterSpacing: 1.5,
              fontWeight: "500",
              marginBottom: 12,
            }}
          >
            ACTIVITY — LAST 15 WEEKS
          </Text>
          <View
            style={{
              backgroundColor: "#111111",
              borderRadius: 16,
              padding: 16,
              borderWidth: 0.5,
              borderColor: "#1f1f1f",
            }}
          >
            <Heatmap />
            {/* legend */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                marginTop: 12,
                justifyContent: "flex-end",
              }}
            >
              <Text style={{ color: "#3f3f46", fontSize: 10 }}>Less</Text>
              {["#1a1a1a", "#78350f", "#b45309", "#d97706", "#f59e0b"].map(
                (c) => (
                  <View
                    key={c}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      backgroundColor: c,
                    }}
                  />
                ),
              )}
              <Text style={{ color: "#3f3f46", fontSize: 10 }}>More</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
