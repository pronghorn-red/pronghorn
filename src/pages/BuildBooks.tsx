import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Book, Filter } from "lucide-react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BuildBookCard } from "@/components/buildbook/BuildBookCard";
import { useRealtimeBuildBooks } from "@/hooks/useRealtimeBuildBooks";
import { useAdmin } from "@/contexts/AdminContext";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function BuildBooks() {
  const navigate = useNavigate();
  const { buildBooks, isLoading } = useRealtimeBuildBooks();
  const { isAdmin } = useAdmin();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");

  const filteredBuildBooks = buildBooks.filter((book) => {
    const matchesSearch =
      searchQuery === "" ||
      book.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.short_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "published" && book.is_published) ||
      (statusFilter === "draft" && !book.is_published);

    return matchesSearch && matchesStatus;
  });

  const handleCreateNew = () => {
    navigate("/build-books/new");
  };

  const handleCardClick = (bookId: string) => {
    navigate(`/build-books/${bookId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <main className="container py-8 px-4 md:px-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Book className="h-8 w-8 text-primary" />
              Build Books
            </h1>
            <p className="text-muted-foreground mt-1">
              Curated collections of standards and tech stacks for organizations
            </p>
          </div>
          {isAdmin && (
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              New Build Book
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search build books..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {isAdmin && (
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="w-[140px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Drafts</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-4 mb-6">
          <Badge variant="secondary" className="text-sm">
            {filteredBuildBooks.length} Build Book{filteredBuildBooks.length !== 1 ? "s" : ""}
          </Badge>
          {isAdmin && (
            <>
              <Badge variant="outline" className="text-sm">
                {buildBooks.filter((b) => b.is_published).length} Published
              </Badge>
              <Badge variant="outline" className="text-sm">
                {buildBooks.filter((b) => !b.is_published).length} Drafts
              </Badge>
            </>
          )}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[16/9] w-full rounded-lg" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : filteredBuildBooks.length === 0 ? (
          <div className="text-center py-16">
            <Book className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Build Books Found</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Create your first build book to get started"}
            </p>
            {isAdmin && !searchQuery && statusFilter === "all" && (
              <Button onClick={handleCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                Create Build Book
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredBuildBooks.map((book) => (
              <BuildBookCard
                key={book.id}
                buildBook={book}
                onClick={() => handleCardClick(book.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
