import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    FlatList,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { searchBooks, searchNotes } from "../db/queries";
import type { Book, Note } from "../types/index";

type NoteResult = Note & { book_title: string };

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [notes, setNotes] = useState<NoteResult[]>([]);
  const [tab, setTab] = useState<"books" | "notes">("books");

  useFocusEffect(
    useCallback(() => {
      if (query.trim().length > 1) runSearch(query);
    }, [query]),
  );

  function runSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setBooks([]);
      setNotes([]);
      return;
    }
    setBooks(searchBooks(q));
    setNotes(searchNotes(q));
  }

  const hasResults = books.length > 0 || notes.length > 0;
  const searched = query.trim().length >= 2;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
      {/* Header */}
      <View
        style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 }}
      >
        <Text
          style={{
            color: "#ffffff",
            fontSize: 26,
            fontWeight: "700",
            letterSpacing: -0.5,
            marginBottom: 14,
          }}
        >
          Search
        </Text>

        {/* Search input */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#1a1a1a",
            borderRadius: 12,
            borderWidth: 0.5,
            borderColor: "#2a2a2a",
            paddingHorizontal: 14,
            height: 46,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 16 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={runSearch}
            placeholder="Books, authors, notes..."
            placeholderTextColor="#3f3f46"
            style={{
              flex: 1,
              color: "#ffffff",
              fontSize: 15,
            }}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => runSearch("")}>
              <Text style={{ color: "#52525b", fontSize: 18 }}>×</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs — only show when there are results */}
        {searched && hasResults && (
          <View
            style={{
              flexDirection: "row",
              marginTop: 14,
              backgroundColor: "#1a1a1a",
              borderRadius: 10,
              padding: 3,
            }}
          >
            {(["books", "notes"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor: tab === t ? "#2a2a2a" : "transparent",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: tab === t ? "#ffffff" : "#52525b",
                    fontSize: 13,
                    fontWeight: tab === t ? "600" : "400",
                  }}
                >
                  {t === "books"
                    ? `Books (${books.length})`
                    : `Notes (${notes.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={{ height: 0.5, backgroundColor: "#1f1f1f" }} />

      {/* Empty / idle state */}
      {!searched ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingBottom: 80,
          }}
        >
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🔍</Text>
          <Text style={{ color: "#3f3f46", fontSize: 15, textAlign: "center" }}>
            Search your books and notes
          </Text>
        </View>
      ) : !hasResults ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingBottom: 80,
          }}
        >
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📭</Text>
          <Text
            style={{
              color: "#ffffff",
              fontSize: 16,
              fontWeight: "600",
              marginBottom: 6,
            }}
          >
            No results
          </Text>
          <Text style={{ color: "#52525b", fontSize: 13 }}>
            {`   Nothing matched "{query}"`}
          </Text>
        </View>
      ) : tab === "books" ? (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => (
            <View style={{ height: 0.5, backgroundColor: "#1f1f1f" }} />
          )}
          renderItem={({ item }) => {
            const progress =
              item.total_pages > 0
                ? Math.round((item.current_page / item.total_pages) * 100)
                : 0;
            return (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/reader/[id]",
                    params: { id: item.id.toString() },
                  })
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  gap: 14,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    backgroundColor:
                      ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"][
                        item.id % 4
                      ] + "22",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 22 }}>
                    {item.file_type === "epub" ? "📗" : "📕"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: "#f4f4f5",
                      fontSize: 14,
                      fontWeight: "600",
                      marginBottom: 2,
                    }}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={{ color: "#52525b", fontSize: 12 }}
                    numberOfLines={1}
                  >
                    {item.author ?? "Unknown"} · {progress}%
                  </Text>
                </View>
                <Text style={{ color: "#3f3f46", fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => (
            <View style={{ height: 0.5, backgroundColor: "#1f1f1f" }} />
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ paddingVertical: 14, gap: 4 }}
              onPress={() =>
                router.push({
                  pathname: "/reader/[id]",
                  params: { id: item.book_id.toString() },
                })
              }
            >
              <Text
                style={{
                  color: "#f4f4f5",
                  fontSize: 14,
                  lineHeight: 20,
                }}
                numberOfLines={2}
              >
                {item.content}
              </Text>
              <Text style={{ color: "#52525b", fontSize: 11, marginTop: 2 }}>
                {item.book_title} · page {item.page}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}
