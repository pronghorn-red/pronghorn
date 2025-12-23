import { useState, useEffect } from "react";
import { BookOpen, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BuildBook {
  id: string;
  name: string;
  short_description: string | null;
  cover_image_url: string | null;
  tags: string[] | null;
}

interface ApplyBuildBookDialogProps {
  projectId: string;
  shareToken: string | null;
  onApplied: () => void;
}

export function ApplyBuildBookDialog({ projectId, shareToken, onApplied }: ApplyBuildBookDialogProps) {
  const [open, setOpen] = useState(false);
  const [buildBooks, setBuildBooks] = useState<BuildBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadBuildBooks();
    }
  }, [open]);

  const loadBuildBooks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("build_books")
        .select("id, name, short_description, cover_image_url, tags")
        .eq("is_published", true)
        .order("name");

      if (error) throw error;
      setBuildBooks(data || []);
    } catch (error: any) {
      toast.error("Failed to load build books: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedBookId) return;

    setApplying(true);
    try {
      // Get the build book's standards and tech stacks
      const [standardsRes, techStacksRes] = await Promise.all([
        supabase
          .from("build_book_standards")
          .select("standard_id")
          .eq("build_book_id", selectedBookId),
        supabase
          .from("build_book_tech_stacks")
          .select("tech_stack_id")
          .eq("build_book_id", selectedBookId),
      ]);

      if (standardsRes.error) throw standardsRes.error;
      if (techStacksRes.error) throw techStacksRes.error;

      const standardIds = standardsRes.data?.map((s) => s.standard_id) || [];
      const techStackIds = techStacksRes.data?.map((t) => t.tech_stack_id) || [];

      // Insert project standards directly (build_book_standards now stores individual standard IDs)
      for (const standardId of standardIds) {
        await supabase.rpc("insert_project_standard_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null,
          p_standard_id: standardId,
        });
      }

      // Get all tech stack items for these stacks
      if (techStackIds.length > 0) {
        const { data: techItems } = await supabase
          .from("tech_stacks")
          .select("id")
          .in("parent_id", techStackIds);

        const techItemIds = techItems?.map((t) => t.id) || [];

        // Insert project tech stacks
        for (const techStackId of techItemIds) {
          await supabase.rpc("insert_project_tech_stack_with_token", {
            p_project_id: projectId,
            p_token: shareToken || null,
            p_tech_stack_id: techStackId,
          });
        }
      }

      toast.success("Build book applied successfully");
      setOpen(false);
      onApplied();
    } catch (error: any) {
      toast.error("Failed to apply build book: " + error.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <BookOpen className="h-4 w-4 mr-2" />
          Apply Build Book
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply Build Book</DialogTitle>
          <DialogDescription>
            Select a build book to automatically apply its standards and tech stacks to this project.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : buildBooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No published build books available
            </div>
          ) : (
            <div className="space-y-3">
              {buildBooks.map((book) => (
                <div
                  key={book.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedBookId === book.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-muted-foreground/50"
                  }`}
                  onClick={() => setSelectedBookId(book.id)}
                >
                  <div className="flex gap-4">
                    {book.cover_image_url ? (
                      <img
                        src={book.cover_image_url}
                        alt={book.name}
                        className="w-24 h-14 object-cover rounded"
                      />
                    ) : (
                      <div className="w-24 h-14 bg-muted rounded flex items-center justify-center">
                        <BookOpen className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold truncate">{book.name}</h4>
                        {selectedBookId === book.id && (
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                      </div>
                      {book.short_description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {book.short_description}
                        </p>
                      )}
                      {book.tags && book.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {book.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-muted px-2 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!selectedBookId || applying}>
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              "Apply Selected"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
