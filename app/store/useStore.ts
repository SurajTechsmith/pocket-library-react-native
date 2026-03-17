import { create } from "zustand";
import type { Book } from "../types";

type Store = {
  books: Book[];
  setBooks: (books: Book[]) => void;
  updateBookProgress: (id: number, page: number, total: number, cfi?: string) => void;
};

export const useStore = create<Store>((set) => ({
  books: [],

  setBooks: (books) => set({ books }),

  updateBookProgress: (id, page, total, cfi) =>
    set((state) => ({
      books: state.books.map((b) =>
        b.id === id
          ? { ...b, current_page: page, total_pages: total, current_cfi: cfi ?? b.current_cfi }
          : b
      ),
    })),
}));