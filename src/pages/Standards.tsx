import { useState, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { Standard } from "@/components/standards/StandardsTree";
import { CategoryCard } from "@/components/standards/CategoryCard";
import { AICreateStandardsDialog } from "@/components/standards/AICreateStandardsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";
import { toast } from "sonner";

export default function Standards() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [searchQuery, setSearchQuery] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [standardsByCategory, setStandardsByCategory] = useState<Record<string, Standard[]>>({});
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    loadCategories();
    loadStandards();
  }, []);

  const loadCategories = async () => {
    const { data } = await supabase.from("standard_categories").select("*").order("order_index");
    setCategories(data || []);
  };

  const loadStandards = async () => {
    const { data } = await supabase.from("standards").select(`*, attachments:standard_attachments(*)`).order("code");
    if (data) {
      const grouped: Record<string, Standard[]> = {};
      
      data.filter((s) => !s.parent_id).forEach((s) => {
        const standard: Standard = {
          id: s.id,
          code: s.code,
          title: s.title,
          description: s.description,
          content: s.content,
          children: buildTree(data, s.id),
          attachments: s.attachments?.map((a: any) => ({ id: a.id, type: a.type, name: a.name, url: a.url, description: a.description })),
        };
        
        if (!grouped[s.category_id]) {
          grouped[s.category_id] = [];
        }
        grouped[s.category_id].push(standard);
      });
      
      setStandardsByCategory(grouped);
    }
  };

  const buildTree = (all: any[], parentId: string): Standard[] => {
    return all.filter((s) => s.parent_id === parentId).map((s) => ({
      id: s.id,
      code: s.code,
      title: s.title,
      description: s.description,
      content: s.content,
      children: buildTree(all, s.id),
      attachments: s.attachments?.map((a: any) => ({ id: a.id, type: a.type, name: a.name, url: a.url, description: a.description })),
    }));
  };

  const handleAddCategory = async () => {
    if (!isAdmin) {
      toast.error("Admin access required");
      return;
    }
    
    if (!newCategoryName.trim()) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", user?.id).single();
    
    const { error } = await supabase.from("standard_categories").insert({
      name: newCategoryName,
      org_id: profile?.org_id,
      created_by: user?.id,
    });
    
    if (error) {
      if (error.code === '42501') {
        toast.error("Admin access required");
      } else {
        toast.error("Failed to create category");
      }
    } else {
      toast.success("Category created");
      setNewCategoryName("");
      loadCategories();
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!isAdmin) {
      toast.error("Admin access required");
      return;
    }

    if (!confirm("Delete this category and all its standards?")) return;

    const { error } = await supabase.from("standard_categories").delete().eq("id", categoryId);

    if (error) {
      if (error.code === '42501') {
        toast.error("Admin access required");
      } else {
        toast.error("Failed to delete category");
      }
    } else {
      toast.success("Category deleted");
      loadCategories();
      loadStandards();
    }
  };

  const handleUpdateCategory = async (categoryId: string, name: string, description: string) => {
    if (!isAdmin) {
      toast.error("Admin access required");
      return;
    }

    const { error } = await supabase
      .from("standard_categories")
      .update({ name, description })
      .eq("id", categoryId);

    if (error) {
      if (error.code === '42501') {
        toast.error("Admin access required");
      } else {
        toast.error("Failed to update category");
      }
    } else {
      toast.success("Category updated");
      loadCategories();
    }
  };

  const filteredCategories = categories.filter((cat) => {
    const searchLower = searchQuery.toLowerCase();
    
    if (cat.name.toLowerCase().includes(searchLower)) {
      return true;
    }
    
    const categoryStandards = standardsByCategory[cat.id] || [];
    const hasMatchingStandard = (standards: Standard[]): boolean => {
      return standards.some(s => 
        s.title.toLowerCase().includes(searchLower) ||
        s.code.toLowerCase().includes(searchLower) ||
        (s.description && s.description.toLowerCase().includes(searchLower)) ||
        (s.children && hasMatchingStandard(s.children))
      );
    };
    
    return hasMatchingStandard(categoryStandards);
  });

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-2 md:gap-4">
              <h1 className="text-2xl md:text-3xl font-bold">Standards Library</h1>
              {isAdmin && <Badge variant="secondary">Admin</Badge>}
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search standards and categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm md:text-base"
              />
            </div>
          </div>

          {/* Add New Category (inline) - only show for admins */}
          {isAdmin && (
            <Card>
              <CardContent className="pt-4 md:pt-6 p-4 md:p-6">
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                  <Input
                    placeholder="New category name..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                    className="flex-1 text-sm md:text-base"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleAddCategory} size="lg" className="flex-1 md:flex-none">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Category
                    </Button>
                    <AICreateStandardsDialog
                      categories={categories}
                      onSuccess={() => {
                        loadStandards();
                        loadCategories();
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Categories and Standards */}
          {filteredCategories.map((category) => {
            const categoryStandards = standardsByCategory[category.id] || [];

            return (
              <CategoryCard
                key={category.id}
                category={category}
                standards={categoryStandards}
                onDelete={handleDeleteCategory}
                onUpdate={handleUpdateCategory}
                onRefresh={() => loadStandards()}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}