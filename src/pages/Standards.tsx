import { useState, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { Standard } from "@/components/standards/StandardsTree";
import { StandardsTreeManager } from "@/components/standards/StandardsTreeManager";
import { ManageCategoriesDialog } from "@/components/standards/ManageCategoriesDialog";
import { ManageTechStacksDialog } from "@/components/standards/ManageTechStacksDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, FolderCog, Layers, LogOut, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";
import { toast } from "sonner";

export default function Standards() {
  const { isAdmin, requestAdminAccess, logout } = useAdmin();
  const [searchQuery, setSearchQuery] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [standardsByCategory, setStandardsByCategory] = useState<Record<string, Standard[]>>({});
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [showManageTechStacks, setShowManageTechStacks] = useState(false);
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
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required");
        return;
      }
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
      toast.error("Failed to create category");
    } else {
      toast.success("Category created");
      setNewCategoryName("");
      loadCategories();
    }
  };

  const handleManageCategories = async () => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required to manage categories");
        return;
      }
    }
    setShowManageCategories(true);
  };

  const handleManageTechStacks = async () => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required to manage tech stacks");
        return;
      }
    }
    setShowManageTechStacks(true);
  };

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (standardsByCategory[cat.id] || []).some((s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">Standards Library</h1>
              {isAdmin && <Badge variant="secondary">Admin Mode</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <Button onClick={handleManageTechStacks} variant="outline" size="sm">
                    <Layers className="h-4 w-4 mr-2" />
                    Manage Tech Stacks
                  </Button>
                  <Button onClick={handleManageCategories} variant="outline" size="sm">
                    <FolderCog className="h-4 w-4 mr-2" />
                    Manage Categories
                  </Button>
                  <Button onClick={logout} variant="outline" size="sm">
                    <LogOut className="h-4 w-4 mr-2" />
                    Exit Admin Mode
                  </Button>
                </>
              )}
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
                className="pl-9"
              />
            </div>
          </div>

          {/* Add New Category (inline) */}
          {isAdmin && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New category name..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                  />
                  <Button onClick={handleAddCategory} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Category
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Categories and Standards */}
          {filteredCategories.map((category) => {
            const categoryStandards = standardsByCategory[category.id] || [];

            return (
              <Card key={category.id}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {category.icon && <span className="text-2xl">{category.icon}</span>}
                    <CardTitle>{category.name}</CardTitle>
                  </div>
                  {category.description && <CardDescription>{category.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <StandardsTreeManager standards={categoryStandards} categoryId={category.id} onRefresh={loadStandards} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Dialogs */}
      <ManageCategoriesDialog open={showManageCategories} onClose={() => { setShowManageCategories(false); loadCategories(); }} />
      <ManageTechStacksDialog open={showManageTechStacks} onClose={() => { setShowManageTechStacks(false); }} />
    </div>
  );
}
