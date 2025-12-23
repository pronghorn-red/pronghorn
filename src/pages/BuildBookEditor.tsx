import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Trash2, Loader2 } from "lucide-react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BuildBookCoverUpload } from "@/components/buildbook/BuildBookCoverUpload";
import { StandardsTreeSelector } from "@/components/standards/StandardsTreeSelector";
import { TechStackTreeSelector } from "@/components/techstack/TechStackTreeSelector";
import { useBuildBookDetail } from "@/hooks/useRealtimeBuildBooks";
import { useAdmin } from "@/contexts/AdminContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Standard {
  id: string;
  code: string;
  title: string;
  description?: string;
  parent_id?: string;
  children?: Standard[];
}

interface Category {
  id: string;
  name: string;
  description?: string;
  standards: Standard[];
}

interface TechStackItem {
  id: string;
  type: string | null;
  name: string;
  description?: string | null;
  parent_id?: string | null;
  children?: TechStackItem[];
}

interface TechStack {
  id: string;
  name: string;
  description?: string | null;
  items: TechStackItem[];
}

export default function BuildBookEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id; // No id param means we're creating a new build book
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const { buildBook, standards: bbStandards, techStacks: bbTechStacks, isLoading } = useBuildBookDetail(id);

  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedStandards, setSelectedStandards] = useState<Set<string>>(new Set());
  const [selectedTechStacks, setSelectedTechStacks] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Data for tree selectors
  const [categories, setCategories] = useState<Category[]>([]);
  const [techStacks, setTechStacks] = useState<TechStack[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Load categories and tech stacks for tree selectors
  useEffect(() => {
    const loadData = async () => {
      setDataLoading(true);
      try {
        // Load categories and standards
        const { data: categoriesData } = await supabase
          .from("standard_categories")
          .select("*")
          .order("name");

        const { data: standardsData } = await supabase
          .from("standards")
          .select("*")
          .order("code");

        if (categoriesData && standardsData) {
          const buildHierarchy = (standards: any[], parentId: string | null): Standard[] => {
            return standards
              .filter(s => s.parent_id === parentId)
              .map(s => ({
                id: s.id,
                code: s.code,
                title: s.title,
                description: s.description,
                parent_id: s.parent_id,
                children: buildHierarchy(standards, s.id)
              }));
          };

          const categoriesWithStandards: Category[] = categoriesData.map(cat => ({
            id: cat.id,
            name: cat.name,
            description: cat.description,
            standards: buildHierarchy(
              standardsData.filter(s => s.category_id === cat.id),
              null
            )
          }));

          setCategories(categoriesWithStandards);
        }

        // Load tech stacks
        const { data: techStacksData } = await supabase
          .from("tech_stacks")
          .select("*")
          .is("parent_id", null)
          .order("order_index");

        const { data: allTechItems } = await supabase
          .from("tech_stacks")
          .select("*")
          .not("parent_id", "is", null)
          .order("order_index");

        if (techStacksData) {
          const buildTechHierarchy = (items: any[], parentId: string): TechStackItem[] => {
            return (items || [])
              .filter(i => i.parent_id === parentId)
              .map(i => ({
                id: i.id,
                type: i.type,
                name: i.name,
                description: i.description,
                parent_id: i.parent_id,
                children: buildTechHierarchy(items, i.id)
              }));
          };

          const techStacksWithItems: TechStack[] = techStacksData.map(stack => ({
            id: stack.id,
            name: stack.name,
            description: stack.description,
            items: buildTechHierarchy(allTechItems || [], stack.id)
          }));

          setTechStacks(techStacksWithItems);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setDataLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (buildBook) {
      setName(buildBook.name);
      setShortDescription(buildBook.short_description || "");
      setLongDescription(buildBook.long_description || "");
      setCoverImageUrl(buildBook.cover_image_url);
      setTagsInput(buildBook.tags?.join(", ") || "");
      setIsPublished(buildBook.is_published);
      setPrompt((buildBook as any).prompt || "");
    }
  }, [buildBook]);

  useEffect(() => {
    if (bbStandards.length > 0) {
      setSelectedStandards(new Set(bbStandards.map((s) => s.standard_id)));
    }
  }, [bbStandards]);

  useEffect(() => {
    if (bbTechStacks.length > 0) {
      setSelectedTechStacks(new Set(bbTechStacks.map((t) => t.tech_stack_id)));
    }
  }, [bbTechStacks]);

  // Redirect non-admins
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate("/build-books");
    }
  }, [isAdmin, isLoading, navigate]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a name for the build book");
      return;
    }

    setIsSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const bookData = {
        name: name.trim(),
        short_description: shortDescription.trim() || null,
        long_description: longDescription.trim() || null,
        cover_image_url: coverImageUrl,
        tags,
        is_published: isPublished,
        prompt: prompt.trim() || null,
      };

      let bookId: string;

      if (isNew) {
        // Create the build book first
        const { data, error } = await supabase
          .from("build_books")
          .insert(bookData)
          .select("id")
          .single();

        if (error) throw error;
        bookId = data.id;
      } else {
        // Update existing build book
        bookId = id!;
        const { error } = await supabase
          .from("build_books")
          .update(bookData)
          .eq("id", bookId);

        if (error) throw error;

        // Clear existing associations for update
        await supabase
          .from("build_book_standards")
          .delete()
          .eq("build_book_id", bookId);

        await supabase
          .from("build_book_tech_stacks")
          .delete()
          .eq("build_book_id", bookId);
      }

      // Insert standards associations
      const standardIdsArray = Array.from(selectedStandards);
      if (standardIdsArray.length > 0) {
        const { error: standardsError } = await supabase.from("build_book_standards").insert(
          standardIdsArray.map((standardId) => ({
            build_book_id: bookId,
            standard_id: standardId,
          }))
        );
        if (standardsError) throw standardsError;
      }

      // Insert tech stacks associations
      const techStackIdsArray = Array.from(selectedTechStacks);
      if (techStackIdsArray.length > 0) {
        const { error: techStacksError } = await supabase.from("build_book_tech_stacks").insert(
          techStackIdsArray.map((techStackId) => ({
            build_book_id: bookId,
            tech_stack_id: techStackId,
          }))
        );
        if (techStacksError) throw techStacksError;
      }

      toast.success(isNew ? "Build book created" : "Build book updated");
      navigate(`/build-books/${bookId}`);
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error("Failed to save: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("build_books")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Build book deleted");
      navigate("/build-books");
    } catch (error: any) {
      toast.error("Failed to delete: " + error.message);
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <main className="container py-8 px-4 md:px-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/build-books")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {!isNew && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isNew ? "Create" : "Save"}
            </Button>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-6">
          {isNew ? "Create Build Book" : "Edit Build Book"}
        </h1>

        <Tabs defaultValue="details" className="space-y-6">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Government of Alberta Standards"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="short-desc">Short Description</Label>
                  <Input
                    id="short-desc"
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder="Brief summary (shown on cards)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">Tags (comma-separated)</Label>
                  <Input
                    id="tags"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="e.g., government, security, compliance"
                  />
                  {tagsInput && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tagsInput.split(",").map((tag, i) => {
                        const trimmed = tag.trim();
                        return trimmed ? (
                          <Badge key={i} variant="secondary">
                            {trimmed}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div>
                    <Label htmlFor="published">Published</Label>
                    <p className="text-sm text-muted-foreground">
                      Published build books are visible to everyone
                    </p>
                  </div>
                  <Switch
                    id="published"
                    checked={isPublished}
                    onCheckedChange={setIsPublished}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Cover Image */}
            <Card>
              <CardHeader>
                <CardTitle>Cover Image</CardTitle>
              </CardHeader>
              <CardContent>
                <BuildBookCoverUpload
                  currentUrl={coverImageUrl}
                  onUrlChange={setCoverImageUrl}
                  bookName={name}
                  bookDescription={shortDescription}
                />
              </CardContent>
            </Card>

            {/* Long Description */}
            <Card>
              <CardHeader>
                <CardTitle>Long Description</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={longDescription}
                  onChange={(e) => setLongDescription(e.target.value)}
                  placeholder="Detailed description (supports Markdown)"
                  rows={10}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Supports Markdown formatting
                </p>
              </CardContent>
            </Card>

            {/* AI Prompt */}
            <Card>
              <CardHeader>
                <CardTitle>AI Assistant Prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Define how the AI assistant should behave when users ask questions about this build book. Leave empty for default behavior."
                  rows={8}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  The AI will have access to all standards and tech stacks in this build book to answer questions.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="content" className="space-y-6">
            {/* Standards Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Standards</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Select individual standards to include in this build book
                </p>
                {dataLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <StandardsTreeSelector
                    categories={categories}
                    selectedStandards={selectedStandards}
                    onSelectionChange={setSelectedStandards}
                  />
                )}
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedStandards.size} standards selected
                </p>
              </CardContent>
            </Card>

            {/* Tech Stacks Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Tech Stacks</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Select tech stack items to include in this build book
                </p>
                {dataLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <TechStackTreeSelector
                    techStacks={techStacks}
                    selectedItems={selectedTechStacks}
                    onSelectionChange={setSelectedTechStacks}
                    preloadedItems={true}
                  />
                )}
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedTechStacks.size} items selected
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Build Book</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this build book? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
