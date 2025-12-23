import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Book, Edit, Calendar, Tag, Library, Layers, Eye, EyeOff } from "lucide-react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBuildBookDetail } from "@/hooks/useRealtimeBuildBooks";
import { useAdmin } from "@/contexts/AdminContext";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface StandardCategory {
  id: string;
  name: string;
  description: string | null;
}

interface TechStack {
  id: string;
  name: string;
  description: string | null;
}

export default function BuildBookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { buildBook, standards, techStacks, isLoading } = useBuildBookDetail(id);
  const { isAdmin } = useAdmin();
  const [standardCategories, setStandardCategories] = useState<StandardCategory[]>([]);
  const [techStackDetails, setTechStackDetails] = useState<TechStack[]>([]);

  useEffect(() => {
    if (standards.length > 0) {
      loadStandardCategories();
    }
  }, [standards]);

  useEffect(() => {
    if (techStacks.length > 0) {
      loadTechStackDetails();
    }
  }, [techStacks]);

  const loadStandardCategories = async () => {
    const ids = standards.map((s) => s.standard_category_id);
    const { data } = await supabase
      .from("standard_categories")
      .select("id, name, description")
      .in("id", ids);
    setStandardCategories(data || []);
  };

  const loadTechStackDetails = async () => {
    const ids = techStacks.map((t) => t.tech_stack_id);
    const { data } = await supabase
      .from("tech_stacks")
      .select("id, name, description")
      .in("id", ids);
    setTechStackDetails(data || []);
  };

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
              className="w-full aspect-[21/9] object-cover"
            />
          ) : (
            <div className="w-full aspect-[21/9] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
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

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="standards" className="gap-2">
              <Library className="h-4 w-4" />
              Standards ({standards.length})
            </TabsTrigger>
            <TabsTrigger value="tech-stacks" className="gap-2">
              <Layers className="h-4 w-4" />
              Tech Stacks ({techStacks.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {buildBook.long_description ? (
              <Card>
                <CardContent className="prose prose-sm dark:prose-invert max-w-none pt-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {buildBook.long_description}
                  </ReactMarkdown>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No detailed description provided.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="standards">
            {standardCategories.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Library className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  No standards included in this build book.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {standardCategories.map((cat) => (
                  <Card key={cat.id} className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Library className="h-5 w-5 text-primary" />
                        {cat.name}
                      </CardTitle>
                    </CardHeader>
                    {cat.description && (
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {cat.description}
                        </p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="tech-stacks">
            {techStackDetails.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  No tech stacks included in this build book.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {techStackDetails.map((stack) => (
                  <Card key={stack.id} className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Layers className="h-5 w-5 text-primary" />
                        {stack.name}
                      </CardTitle>
                    </CardHeader>
                    {stack.description && (
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {stack.description}
                        </p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
