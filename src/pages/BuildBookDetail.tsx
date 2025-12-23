import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Book, Edit, Calendar, Tag, Eye, EyeOff } from "lucide-react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useBuildBookDetail } from "@/hooks/useRealtimeBuildBooks";
import { useAdmin } from "@/contexts/AdminContext";
import { format } from "date-fns";
import { BuildBookDocsViewer } from "@/components/buildbook/BuildBookDocsViewer";

export default function BuildBookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { buildBook, standards, techStacks, isLoading } = useBuildBookDetail(id);
  const { isAdmin } = useAdmin();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <main className="container py-8 px-4 md:px-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="aspect-[21/9] w-full rounded-lg mb-6" />
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-6 w-2/3" />
        </main>
      </div>
    );
  }

  if (!buildBook) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <main className="container py-8 px-4 md:px-6 text-center">
          <Book className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Build Book Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The build book you're looking for doesn't exist or you don't have access.
          </p>
          <Button onClick={() => navigate("/build-books")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Build Books
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <main className="container py-8 px-4 md:px-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate("/build-books")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Build Books
        </Button>

        {/* Hero Section */}
        <div className="relative rounded-xl overflow-hidden mb-8">
          {buildBook.cover_image_url ? (
            <img
              src={buildBook.cover_image_url}
              alt={buildBook.name}
              className="w-full aspect-[21/6] object-cover"
            />
          ) : (
            <div className="w-full aspect-[21/6] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Book className="h-24 w-24 text-primary/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
            <div className="flex items-center gap-3 mb-3">
              {buildBook.is_published ? (
                <Badge className="gap-1">
                  <Eye className="h-3 w-3" />
                  Published
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <EyeOff className="h-3 w-3" />
                  Draft
                </Badge>
              )}
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Updated {format(new Date(buildBook.updated_at), "MMM d, yyyy")}
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">{buildBook.name}</h1>
            {buildBook.short_description && (
              <p className="text-lg text-muted-foreground max-w-3xl">
                {buildBook.short_description}
              </p>
            )}
          </div>
          {isAdmin && (
            <Button
              className="absolute top-4 right-4"
              onClick={() => navigate(`/build-books/${id}/edit`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>

        {/* Tags */}
        {buildBook.tags && buildBook.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {buildBook.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1">
                <Tag className="h-3 w-3" />
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Documentation Viewer */}
        <BuildBookDocsViewer
          buildBook={buildBook}
          standards={standards}
          techStacks={techStacks}
        />
      </main>
    </div>
  );
}
