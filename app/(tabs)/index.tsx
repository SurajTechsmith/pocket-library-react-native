import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { addBook, deleteBook, getBooksSorted, SortOrder } from "../db/queries";
import { useStore } from "../store/useStore";
import type { Book } from "../types/index";

const CARD_WIDTH = (Dimensions.get("window").width - 48) / 2;

const ACCENTS = [
  "#f59e0b",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];
const EMOJIS = ["📕", "📗", "📘", "📙", "📔", "📒"];

function BookCard({
  book,
  onPress,
  onLongPress,
}: {
  book: Book;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const progress =
    book.total_pages > 0
      ? Math.min(book.current_page / book.total_pages, 1)
      : 0;
  const percent = Math.round(progress * 100);
  const accent = ACCENTS[book.id % ACCENTS.length];
  const emoji = EMOJIS[book.id % EMOJIS.length];
  const isFinished = percent === 100;
  const isStarted = percent > 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
      style={{ width: CARD_WIDTH }}
    >
      {/* Cover */}
      <View
        style={{
          width: "100%",
          height: CARD_WIDTH * 1.4,
          borderRadius: 14,
          backgroundColor: accent + "18",
          borderWidth: 1,
          borderColor: accent + "30",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 10,
          overflow: "hidden",
        }}
      >
        <Text style={{ fontSize: 52 }}>{emoji}</Text>

        {/* progress strip */}
        {isStarted && !isFinished && (
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 3,
              backgroundColor: "#ffffff08",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${percent}%`,
                backgroundColor: accent,
              }}
            />
          </View>
        )}

        {/* finished badge */}
        {isFinished && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#00000055",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 28 }}>✓</Text>
            <Text
              style={{
                color: "#10b981",
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1,
                marginTop: 2,
              }}
            >
              FINISHED
            </Text>
          </View>
        )}

        {/* type pill */}
        <View
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            backgroundColor: "#00000066",
            borderRadius: 6,
            paddingHorizontal: 5,
            paddingVertical: 2,
          }}
        >
          <Text style={{ color: "#ffffff88", fontSize: 9, fontWeight: "600" }}>
            {book.file_type.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text
        numberOfLines={2}
        style={{
          color: "#f4f4f5",
          fontSize: 13,
          fontWeight: "600",
          lineHeight: 18,
          marginBottom: 2,
        }}
      >
        {book.title}
      </Text>

      {/* Author */}
      <Text
        numberOfLines={1}
        style={{ color: "#52525b", fontSize: 11, marginBottom: 5 }}
      >
        {book.author ?? "Unknown"}
      </Text>

      {/* Status */}
      <Text
        style={{
          fontSize: 11,
          fontWeight: "500",
          color: isFinished ? "#10b981" : isStarted ? accent : "#3f3f46",
        }}
      >
        {isFinished
          ? "Finished"
          : isStarted
            ? `${percent}% read`
            : "Not started"}
      </Text>
    </TouchableOpacity>
  );
}

const SORT_OPTIONS: { label: string; value: SortOrder }[] = [
  { label: "Recently opened", value: "recent" },
  { label: "Title A–Z", value: "title" },
  { label: "Most progress", value: "progress" },
  { label: "Date added", value: "added" },
];

export default function LibraryScreen() {
  const router = useRouter();
  const { books, setBooks } = useStore();
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortOrder>("recent");
  const [showSort, setShowSort] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setBooks(getBooksSorted(sort));
    }, [sort]),
  );

  async function importBook() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/epub+zip"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      setLoading(true);
      const file = result.assets[0];
      const isEpub = file.name.toLowerCase().endsWith(".epub");
      const title = file.name
        .replace(/\.(pdf|epub)$/i, "")
        .replace(/[-_]/g, " ")
        .trim();

      addBook(title, "Unknown Author", file.uri, isEpub ? "epub" : "pdf");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBooks(getBooksSorted(sort));
    } catch {
      Alert.alert("Error", "Could not import file.");
    } finally {
      setLoading(false);
    }
  }

  function confirmDelete(id: number, title: string) {
    Alert.alert("Remove Book", `Remove "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          deleteBook(id);
          setBooks(getBooksSorted(sort));
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  }

  function applySort(s: SortOrder) {
    setSort(s);
    setBooks(getBooksSorted(s));
    setShowSort(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const finished = books.filter(
    (b) => b.total_pages > 0 && b.current_page >= b.total_pages,
  ).length;
  const inProgress = books.filter(
    (b) => b.current_page > 1 && b.current_page < b.total_pages,
  ).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View>
            <Text
              style={{
                color: "#52525b",
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: "500",
                marginBottom: 4,
              }}
            >
              POCKET LIBRARY
            </Text>
            <Text
              style={{
                color: "#ffffff",
                fontSize: 26,
                fontWeight: "700",
                letterSpacing: -0.5,
              }}
            >
              My Books
            </Text>
          </View>

          <TouchableOpacity
            onPress={importBook}
            disabled={loading}
            style={{
              backgroundColor: "#f59e0b",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 12,
              marginTop: 8,
              minWidth: 80,
              alignItems: "center",
            }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={{ color: "#000", fontWeight: "700", fontSize: 13 }}>
                + Add
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* mini stats row */}
        {books.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              gap: 16,
              marginTop: 14,
              marginBottom: 4,
            }}
          >
            {[
              { label: "Total", value: books.length },
              { label: "Reading", value: inProgress },
              { label: "Finished", value: finished },
            ].map((s) => (
              <View key={s.label} style={{ alignItems: "center" }}>
                <Text
                  style={{
                    color: "#ffffff",
                    fontSize: 18,
                    fontWeight: "700",
                  }}
                >
                  {s.value}
                </Text>
                <Text style={{ color: "#52525b", fontSize: 10, marginTop: 1 }}>
                  {s.label}
                </Text>
              </View>
            ))}

            {/* sort button */}
            <TouchableOpacity
              onPress={() => setShowSort(true)}
              style={{
                marginLeft: "auto",
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#1a1a1a",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 0.5,
                borderColor: "#2a2a2a",
              }}
            >
              <Text style={{ color: "#a1a1aa", fontSize: 11 }}>⇅</Text>
              <Text style={{ color: "#a1a1aa", fontSize: 11 }}>Sort</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Divider */}
      <View
        style={{ height: 0.5, backgroundColor: "#1f1f1f", marginBottom: 4 }}
      />

      {/* Empty state */}
      {books.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 40,
          }}
        >
          <Text style={{ fontSize: 72, marginBottom: 16 }}>📚</Text>
          <Text
            style={{
              color: "#ffffff",
              fontSize: 20,
              fontWeight: "700",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Your shelf is empty
          </Text>
          <Text
            style={{
              color: "#52525b",
              fontSize: 14,
              textAlign: "center",
              lineHeight: 21,
            }}
          >
            Tap + Add to import a PDF or ePub from your phone
          </Text>
          <TouchableOpacity
            onPress={importBook}
            style={{
              marginTop: 28,
              backgroundColor: "#f59e0b",
              paddingHorizontal: 28,
              paddingVertical: 14,
              borderRadius: 14,
            }}
          >
            <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
              Import your first book
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={books}
          numColumns={2}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          columnWrapperStyle={{ gap: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 24 }} />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <BookCard
              book={item}
              onPress={() =>
                router.push({
                  pathname: "/reader/[id]",
                  params: { id: item.id.toString() },
                })
              }
              onLongPress={() => confirmDelete(item.id, item.title)}
            />
          )}
        />
      )}

      {/* Sort modal */}
      <Modal visible={showSort} transparent animationType="slide">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "#00000080" }}
          activeOpacity={1}
          onPress={() => setShowSort(false)}
        />
        <View
          style={{
            backgroundColor: "#111111",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
            borderTopWidth: 0.5,
            borderTopColor: "#2a2a2a",
          }}
        >
          <Text
            style={{
              color: "#ffffff",
              fontSize: 16,
              fontWeight: "700",
              marginBottom: 16,
            }}
          >
            Sort books
          </Text>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => applySort(opt.value)}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 14,
                borderBottomWidth: 0.5,
                borderBottomColor: "#1f1f1f",
              }}
            >
              <Text
                style={{
                  color: sort === opt.value ? "#f59e0b" : "#d4d4d8",
                  fontSize: 15,
                  fontWeight: sort === opt.value ? "600" : "400",
                }}
              >
                {opt.label}
              </Text>
              {sort === opt.value && (
                <Text style={{ color: "#f59e0b", fontSize: 16 }}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
