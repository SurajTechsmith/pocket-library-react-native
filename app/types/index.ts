export type Book = {
  id: number;
  title: string;
  author: string | null;
  file_path: string;
  file_type: "pdf" | "epub";
  total_pages: number;
  current_page: number;
  current_cfi: string | null;
  added_at: number;
  last_opened_at: number | null;
};

export type Bookmark = {
  id: number;
  book_id: number;
  page: number;
  cfi: string | null;
  label: string | null;
  created_at: number;
};

export type Note = {
  id: number;
  book_id: number;
  page: number;
  content: string;
  created_at: number;
};

export type Session = {
  id: number;
  book_id: number;
  date: string;
  pages_read: number;
  duration_seconds: number;
};