import type { Book, Bookmark, Note } from "../types/index";
import db from "./db";

// ─────────────────────────────────────────
// BOOKS
// ─────────────────────────────────────────

export function getAllBooks(): Book[] {
  return db.getAllSync(
    "SELECT * FROM books ORDER BY last_opened_at DESC, added_at DESC"
  ) as Book[];
}

export function getBook(id: number): Book | null {
  return db.getFirstSync(
    "SELECT * FROM books WHERE id = ?", [id]
  ) as Book | null;
}

export function addBook(
  title: string,
  author: string,
  filePath: string,
  fileType: "pdf" | "epub"
): number {
  const r = db.runSync(
    `INSERT INTO books (title, author, file_path, file_type, added_at)
     VALUES (?, ?, ?, ?, ?)`,
    [title, author, filePath, fileType, Date.now()]
  );
  return r.lastInsertRowId;
}

export function updateProgress(
  id: number,
  page: number,
  total: number,
  cfi?: string
) {
  db.runSync(
    `UPDATE books
     SET current_page = ?, total_pages = ?, current_cfi = ?, last_opened_at = ?
     WHERE id = ?`,
    [page, total, cfi ?? null, Date.now(), id]
  );
}

export function deleteBook(id: number) {
  // CASCADE in schema deletes bookmarks + notes too
  db.runSync("DELETE FROM books WHERE id = ?", [id]);
}

export function updateBookMeta(id: number, title: string, author: string) {
  db.runSync(
    "UPDATE books SET title = ?, author = ? WHERE id = ?",
    [title, author, id]
  );
}

// sort options for shelf
export type SortOrder = "recent" | "title" | "progress" | "added";

export function getBooksSorted(sort: SortOrder): Book[] {
  const orderMap: Record<SortOrder, string> = {
    recent:   "last_opened_at DESC, added_at DESC",
    title:    "title ASC",
    progress: "(CAST(current_page AS REAL) / MAX(total_pages, 1)) DESC",
    added:    "added_at DESC",
  };
  return db.getAllSync(
    `SELECT * FROM books ORDER BY ${orderMap[sort]}`
  ) as Book[];
}

// search books by title or author
export function searchBooks(query: string): Book[] {
  const q = `%${query}%`;
  return db.getAllSync(
    `SELECT * FROM books
     WHERE title LIKE ? OR author LIKE ?
     ORDER BY last_opened_at DESC`,
    [q, q]
  ) as Book[];
}

// ─────────────────────────────────────────
// BOOKMARKS
// ─────────────────────────────────────────

export function getBookmarks(bookId: number): Bookmark[] {
  return db.getAllSync(
    "SELECT * FROM bookmarks WHERE book_id = ? ORDER BY page ASC",
    [bookId]
  ) as Bookmark[];
}

export function addBookmark(
  bookId: number,
  page: number,
  label?: string,
  cfi?: string
) {
  // no duplicate bookmarks on same page
  const exists = db.getFirstSync(
    "SELECT id FROM bookmarks WHERE book_id = ? AND page = ?",
    [bookId, page]
  );
  if (exists) return;

  db.runSync(
    `INSERT INTO bookmarks (book_id, page, cfi, label, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [bookId, page, cfi ?? null, label ?? null, Date.now()]
  );
}

export function deleteBookmark(id: number) {
  db.runSync("DELETE FROM bookmarks WHERE id = ?", [id]);
}

export function isPageBookmarked(bookId: number, page: number): boolean {
  const r = db.getFirstSync(
    "SELECT id FROM bookmarks WHERE book_id = ? AND page = ?",
    [bookId, page]
  );
  return !!r;
}

// ─────────────────────────────────────────
// NOTES
// ─────────────────────────────────────────

export function getNotes(bookId: number): Note[] {
  return db.getAllSync(
    "SELECT * FROM notes WHERE book_id = ? ORDER BY created_at DESC",
    [bookId]
  ) as Note[];
}

export function getNotesForPage(bookId: number, page: number): Note[] {
  return db.getAllSync(
    "SELECT * FROM notes WHERE book_id = ? AND page = ? ORDER BY created_at DESC",
    [bookId, page]
  ) as Note[];
}

export function addNote(
  bookId: number,
  page: number,
  content: string
): number {
  const r = db.runSync(
    `INSERT INTO notes (book_id, page, content, created_at)
     VALUES (?, ?, ?, ?)`,
    [bookId, page, content, Date.now()]
  );
  return r.lastInsertRowId;
}

export function updateNote(id: number, content: string) {
  db.runSync(
    "UPDATE notes SET content = ? WHERE id = ?",
    [content, id]
  );
}

export function deleteNote(id: number) {
  db.runSync("DELETE FROM notes WHERE id = ?", [id]);
}

// search notes by content
export function searchNotes(query: string): (Note & { book_title: string })[] {
  const q = `%${query}%`;
  return db.getAllSync(
    `SELECT n.*, b.title as book_title
     FROM notes n
     JOIN books b ON n.book_id = b.id
     WHERE n.content LIKE ?
     ORDER BY n.created_at DESC`,
    [q]
  ) as (Note & { book_title: string })[];
}

// ─────────────────────────────────────────
// SESSIONS + STATS
// ─────────────────────────────────────────

export function upsertSession(
  bookId: number,
  pagesRead: number,
  seconds: number
) {
  const today = new Date().toISOString().split("T")[0];
  const existing = db.getFirstSync(
    "SELECT id FROM sessions WHERE book_id = ? AND date = ?",
    [bookId, today]
  );

  if (existing) {
    db.runSync(
      `UPDATE sessions
       SET pages_read = pages_read + ?,
           duration_seconds = duration_seconds + ?
       WHERE book_id = ? AND date = ?`,
      [pagesRead, seconds, bookId, today]
    );
  } else {
    db.runSync(
      `INSERT INTO sessions (book_id, date, pages_read, duration_seconds)
       VALUES (?, ?, ?, ?)`,
      [bookId, today, pagesRead, seconds]
    );
  }
}

export function getTodayStats(): { pages: number; seconds: number } {
  const today = new Date().toISOString().split("T")[0];
  const r = db.getFirstSync(
    `SELECT
       COALESCE(SUM(pages_read), 0)      AS pages,
       COALESCE(SUM(duration_seconds), 0) AS seconds
     FROM sessions WHERE date = ?`,
    [today]
  ) as { pages: number; seconds: number } | null;
  return r ?? { pages: 0, seconds: 0 };
}

export function getStreak(): number {
  const rows = db.getAllSync(
    "SELECT DISTINCT date FROM sessions ORDER BY date DESC"
  ) as { date: string }[];

  if (!rows.length) return 0;

  let streak = 0;
  const today = new Date();

  for (let i = 0; i < rows.length; i++) {
    const expected = new Date(today);
    expected.setDate(today.getDate() - i);
    const expectedStr = expected.toISOString().split("T")[0];
    if (rows[i].date === expectedStr) streak++;
    else break;
  }
  return streak;
}

// pages read per day for the last N days — used for the heatmap
export function getSessionsLastNDays(n: number): { date: string; pages: number }[] {
  const rows = db.getAllSync(
    `SELECT date, SUM(pages_read) AS pages
     FROM sessions
     GROUP BY date
     ORDER BY date ASC`
  ) as { date: string; pages: number }[];

  // fill in missing days with 0
  const result: { date: string; pages: number }[] = [];
  const today = new Date();

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const found = rows.find((r) => r.date === dateStr);
    result.push({ date: dateStr, pages: found?.pages ?? 0 });
  }

  return result;
}

export function getTotalStats(): {
  totalBooks: number;
  finishedBooks: number;
  totalPages: number;
  totalMinutes: number;
} {
  const books = db.getFirstSync(
    "SELECT COUNT(*) as total FROM books"
  ) as { total: number };

  const finished = db.getFirstSync(
    `SELECT COUNT(*) as total FROM books
     WHERE total_pages > 0 AND current_page >= total_pages`
  ) as { total: number };

  const sessions = db.getFirstSync(
    `SELECT
       COALESCE(SUM(pages_read), 0)       AS totalPages,
       COALESCE(SUM(duration_seconds), 0)  AS totalSeconds
     FROM sessions`
  ) as { totalPages: number; totalSeconds: number } | null;

  return {
    totalBooks:   books.total,
    finishedBooks: finished.total,
    totalPages:   sessions?.totalPages ?? 0,
    totalMinutes: Math.floor((sessions?.totalSeconds ?? 0) / 60),
  };
}