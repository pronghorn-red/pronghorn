import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
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
import { StandardsCategoryPicker } from "@/components/buildbook/StandardsCategoryPicker";
import { TechStackPicker } from "@/components/buildbook/TechStackPicker";
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

export default function BuildBookEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const { buildBook, standards, techStacks, isLoading } = useBuildBookDetail(isNew ? undefined : id);

  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [selectedStandardIds, setSelectedStandardIds] = useState<string[]>([]);
  const [selectedTechStackIds, setSelectedTechStackIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (buildBook) {
      setName(buildBook.name);
      setShortDescription(buildBook.short_description || "");
      setLongDescription(buildBook.long_description || "");
      setCoverImageUrl(buildBook.cover_image_url);
      setTagsInput(buildBook.tags?.join(", ") || "");
      setIsPublished(buildBook.is_published);
    }
  }, [buildBook]);

  useEffect(() => {
    if (standards.length > 0) {
      setSelectedStandardIds(standards.map((s) => s.standard_category_id));
    }
  }, [standards]);

  useEffect(() => {
    if (techStacks.length > 0) {
      setSelectedTechStackIds(techStacks.map((t) => t.tech_stack_id));
    }
  }, [techStacks]);

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
      };

      let bookId = id;

      if (isNew) {
        const { data, error } = await supabase
          .from("build_books")
          .insert(bookData)
          .select("id")
          .single();

        if (error) throw error;
        bookId = data.id;
      } else {
        const { error } = await supabase
          .from("build_books")
          .update(bookData)
          .eq("id", id);

        if (error) throw error;
      }

      // Sync standards
      if (!isNew) {
        await supabase
          .from("build_book_standards")
          .delete()
          .eq("build_book_id", bookId);
      }

      if (selectedStandardIds.length > 0) {
        await supabase.from("build_book_standards").insert(
          selectedStandardIds.map((standardCategoryId) => ({
            build_book_id: bookId,
            standard_category_id: standardCategoryId,
          }))
        );
      }

      // Sync tech stacks
      if (!isNew) {
        await supabase
          .from("build_book_tech_stacks")
          .delete()
          .eq("build_book_id", bookId);
      }

      if (selectedTechStackIds.length > 0) {
        await supabase.from("build_book_tech_stacks").insert(
          selectedTechStackIds.map((techStackId) => ({
            build_book_id: bookId,
            tech_stack_id: techStackId,
          }))
        );
      }

      toast.success(isNew ? "Build book created" : "Build book updated");
      navigate(`/build-books/${bookId}`);
    } catch (error: any) {
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
          </TabsContent>

          <TabsContent value="content" className="space-y-6">
            {/* Standards Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Standards Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Select the standard categories to include in this build book
                </p>
                <StandardsCategoryPicker
                  selectedIds={selectedStandardIds}
                  onChange={setSelectedStandardIds}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedStandardIds.length} selected
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
                  Select the tech stacks to include in this build book
                </p>
                <TechStackPicker
                  selectedIds={selectedTechStackIds}
                  onChange={setSelectedTechStackIds}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedTechStackIds.length} selected
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
