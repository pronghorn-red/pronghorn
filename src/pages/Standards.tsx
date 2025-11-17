import { useState, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { StandardsTree, Standard } from "@/components/standards/StandardsTree";
import { StandardsTreeManager } from "@/components/standards/StandardsTreeManager";
import { ManageCategoriesDialog } from "@/components/standards/ManageCategoriesDialog";
import { EditStandardDialog } from "@/components/standards/EditStandardDialog";
import { ManageTechStacksDialog } from "@/components/standards/ManageTechStacksDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, FolderCog, Plus, Layers, Shield, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";
import { toast } from "sonner";

export default function Standards() {
  const { isAdmin, requestAdminAccess, logout } = useAdmin();
  const [searchQuery, setSearchQuery] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [showManageTechStacks, setShowManageTechStacks] = useState(false);
  const [editStandardId, setEditStandardId] = useState<string | undefined>();
  const [showEditStandard, setShowEditStandard] = useState(false);

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
      const tree = data.filter((s) => !s.parent_id).map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        description: s.description,
        content: s.content,
        category_id: s.category_id,
        children: buildTree(data, s.id),
        attachments: s.attachments?.map((a: any) => ({ id: a.id, type: a.type, name: a.name, url: a.url, description: a.description })),
      }));
      setStandards(tree);
    }
  };

  const buildTree = (all: any[], parentId: string): Standard[] => {
    return all.filter((s) => s.parent_id === parentId).map((s) => ({
      id: s.id,
      code: s.code,
      title: s.title,
      description: s.description,
      content: s.content,
      category_id: s.category_id,
      children: buildTree(all, s.id),
      attachments: s.attachments?.map((a: any) => ({ id: a.id, type: a.type, name: a.name, url: a.url, description: a.description })),
    }));
  };

  const handleStandardClick = (standard: Standard) => {
    setEditStandardId(standard.id);
    setShowEditStandard(true);
  };

  const handleCreateStandard = async () => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required to create standards");
        return;
      }
    }
    setEditStandardId(undefined);
    setShowEditStandard(true);
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

  const filteredStandards = selectedCategory ? standards.filter((s) => s.id === selectedCategory) : standards;

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <main className="container px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">Standards Library</h1>
              {isAdmin ? (
                <Badge variant="default" className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Admin Mode
                </Badge>
              ) : (
                <Button variant="outline" size="sm" onClick={requestAdminAccess}>
                  <Shield className="h-4 w-4 mr-2" />
                  Admin Mode
                </Button>
              )}
            </div>
            <p className="text-muted-foreground">Manage your organization's standards and requirements</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <Button variant="outline" onClick={handleManageTechStacks}><Layers className="h-4 w-4 mr-2" />Tech Stacks</Button>
                <Button variant="outline" onClick={handleManageCategories}><FolderCog className="h-4 w-4 mr-2" />Categories</Button>
                <Button onClick={handleCreateStandard}><Plus className="h-4 w-4 mr-2" />New Standard</Button>
                <Button variant="ghost" size="icon" onClick={logout} title="Exit Admin Mode"><LogOut className="h-4 w-4" /></Button>
              </>
            )}
          </div>
        </div>

        <Tabs defaultValue="browse" className="space-y-6">
          <TabsList>
            <TabsTrigger value="browse">Browse Standards</TabsTrigger>
            <TabsTrigger value="categories">By Category</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search standards..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Standards Library</CardTitle>
                <CardDescription>
                  Manage organizational standards with AI-powered expansion and knowledge management
                </CardDescription>
              </CardHeader>
              <CardContent>
                {categories.map((category) => {
                  const categoryStandards = filteredStandards.filter(
                    (s: any) => s.category_id === category.id
                  );
                  if (categoryStandards.length === 0) return null;

                  return (
                    <div key={category.id} className="mb-6">
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Badge variant="outline">{category.name}</Badge>
                      </h3>
                      <StandardsTreeManager
                        standards={categoryStandards}
                        categoryId={category.id}
                        onRefresh={loadStandards}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((cat) => (
                <div key={cat.id} className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedCategory(cat.id)}>
                  <div className="flex items-center gap-3">
                    {cat.icon && <span className="text-3xl">{cat.icon}</span>}
                    <div>
                      <div className="font-medium">{cat.name}</div>
                      {cat.description && <div className="text-sm text-muted-foreground">{cat.description}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <ManageCategoriesDialog open={showManageCategories} onClose={() => { setShowManageCategories(false); loadCategories(); }} />
      <ManageTechStacksDialog open={showManageTechStacks} onClose={() => setShowManageTechStacks(false)} />
      <EditStandardDialog open={showEditStandard} onClose={() => { setShowEditStandard(false); loadStandards(); }} standardId={editStandardId} />
    </div>
  );
}
