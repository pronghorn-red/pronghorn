import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BuildBook {
  id: string;
  name: string;
  short_description: string | null;
  long_description: string | null;
  cover_image_url: string | null;
  tags: string[];
  org_id: string | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  prompt: string | null;
}

export interface BuildBookStandard {
  id: string;
  build_book_id: string;
  standard_id: string;
  created_at: string;
}

export interface BuildBookTechStack {
  id: string;
  build_book_id: string;
  tech_stack_id: string;
  created_at: string;
}

export const useRealtimeBuildBooks = () => {
  const [buildBooks, setBuildBooks] = useState<BuildBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadBuildBooks = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("build_books")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setBuildBooks((data as BuildBook[]) || []);
    } catch (error) {
      console.error("Error loading build books:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBuildBooks();

    const channel = supabase
      .channel("build-books-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "build_books" },
        () => loadBuildBooks()
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [loadBuildBooks]);

  return {
    buildBooks,
    isLoading,
    refresh: loadBuildBooks,
  };
};

export const useBuildBookDetail = (buildBookId: string | undefined) => {
  const [buildBook, setBuildBook] = useState<BuildBook | null>(null);
  const [standards, setStandards] = useState<BuildBookStandard[]>([]);
  const [techStacks, setTechStacks] = useState<BuildBookTechStack[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadBuildBook = useCallback(async () => {
    if (!buildBookId) return;
    
    setIsLoading(true);
    try {
      const [bookResult, standardsResult, techStacksResult] = await Promise.all([
        supabase.from("build_books").select("*").eq("id", buildBookId).single(),
        supabase.from("build_book_standards").select("*").eq("build_book_id", buildBookId),
        supabase.from("build_book_tech_stacks").select("*").eq("build_book_id", buildBookId),
      ]);

      if (bookResult.error) throw bookResult.error;
      
      setBuildBook(bookResult.data as BuildBook);
      setStandards((standardsResult.data as BuildBookStandard[]) || []);
      setTechStacks((techStacksResult.data as BuildBookTechStack[]) || []);
    } catch (error) {
      console.error("Error loading build book:", error);
    } finally {
      setIsLoading(false);
    }
  }, [buildBookId]);

  useEffect(() => {
    loadBuildBook();

    if (!buildBookId) return;

    const channel = supabase
      .channel(`build-book-${buildBookId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "build_books", filter: `id=eq.${buildBookId}` }, () => loadBuildBook())
      .on("postgres_changes", { event: "*", schema: "public", table: "build_book_standards", filter: `build_book_id=eq.${buildBookId}` }, () => loadBuildBook())
      .on("postgres_changes", { event: "*", schema: "public", table: "build_book_tech_stacks", filter: `build_book_id=eq.${buildBookId}` }, () => loadBuildBook())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [buildBookId, loadBuildBook]);

  return {
    buildBook,
    standards,
    techStacks,
    isLoading,
    refresh: loadBuildBook,
  };
};
