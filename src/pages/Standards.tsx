import { useState, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { StandardsTree, Standard } from "@/components/standards/StandardsTree";
import { ManageCategoriesDialog } from "@/components/standards/ManageCategoriesDialog";
import { EditStandardDialog } from "@/components/standards/EditStandardDialog";
import { ManageTechStacksDialog } from "@/components/standards/ManageTechStacksDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, FolderCog, Plus, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function Standards() {
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
      children: buildTree(all, s.id),
    }));
  };

  const handleStandardClick = (standard: Standard) => {
    setEditStandardId(standard.id);
    setShowEditStandard(true);
  };

  const handleCreateStandard = () => {
    setEditStandardId(undefined);
    setShowEditStandard(true);
  };

  const filteredStandards = selectedCategory ? standards.filter((s) => s.id === selectedCategory) : standards;

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <main className="container px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Standards Library</h1>
            <p className="text-muted-foreground">Manage your organization's standards and requirements</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowManageTechStacks(true)}><Layers className="h-4 w-4 mr-2" />Tech Stacks</Button>
            <Button variant="outline" onClick={() => setShowManageCategories(true)}><FolderCog className="h-4 w-4 mr-2" />Categories</Button>
            <Button onClick={handleCreateStandard}><Plus className="h-4 w-4 mr-2" />New Standard</Button>
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

            <div className="bg-card border rounded-lg p-4">
              <StandardsTree standards={filteredStandards} onStandardSelect={handleStandardClick} />
            </div>
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
