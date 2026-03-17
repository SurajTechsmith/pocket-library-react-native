import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("pocket-library.db");

export function initDB() {
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'pdf',
      total_pages INTEGER DEFAULT 0,
      current_page INTEGER DEFAULT 1,
      current_cfi TEXT,
      added_at INTEGER NOT NULL,
      last_opened_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      page INTEGER NOT NULL DEFAULT 1,
      cfi TEXT,
      label TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      page INTEGER NOT NULL DEFAULT 1,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      pages_read INTEGER DEFAULT 0,
      duration_seconds INTEGER DEFAULT 0
    );
  `);


}


export default db;