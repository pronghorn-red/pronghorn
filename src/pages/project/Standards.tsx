import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { StandardsTreeSelector } from "@/components/standards/StandardsTreeSelector";
import { TechStackTreeSelector } from "@/components/techstack/TechStackTreeSelector";

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
  icon?: string;
  description?: string;
  standards: Standard[];
}

interface TechStack {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

export default function Standards() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const [categories, setCategories] = useState<Category[]>([]);
  const [techStacks, setTechStacks] = useState<TechStack[]>([]);
  const [selectedStandards, setSelectedStandards] = useState<Set<string>>(new Set());
  const [selectedTechStackItems, setSelectedTechStackItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load categories and standards
      const { data: categoriesData } = await supabase
        .from("standard_categories")
        .select("*")
        .order("order_index");

      const { data: standardsData } = await supabase
        .from("standards")
        .select("*")
        .order("order_index");

      // Build hierarchy
      const categoriesWithStandards: Category[] = (categoriesData || []).map((cat) => ({
        ...cat,
        standards: buildStandardsHierarchy(
          (standardsData || []).filter((s) => s.category_id === cat.id)
        ),
      }));

      setCategories(categoriesWithStandards);

      // Load tech stacks
      const { data: techStacksData } = await supabase
        .from("tech_stacks")
        .select("*")
        .order("name");

      setTechStacks(techStacksData || []);

      // Load selected standards and tech stacks for this project
      const { data: projectStandards } = await supabase.rpc("get_project_standards_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null
      });

      const { data: projectTechStacks } = await supabase.rpc("get_project_tech_stacks_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null
      });

      setSelectedStandards(new Set(projectStandards?.map((ps) => ps.standard_id) || []));
      setSelectedTechStackItems(new Set(projectTechStacks?.map((pts) => pts.tech_stack_id) || []));
    } catch (error: any) {
      toast.error("Failed to load standards: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const buildStandardsHierarchy = (flatStandards: any[]): Standard[] => {
    const map = new Map<string, Standard>();
    const roots: Standard[] = [];

    flatStandards.forEach((std) => {
      map.set(std.id, { ...std, children: [] });
    });

    flatStandards.forEach((std) => {
      const node = map.get(std.id)!;
      if (std.parent_id && map.has(std.parent_id)) {
        map.get(std.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Get existing project standards and tech stacks
      const { data: existingStandards } = await supabase.rpc("get_project_standards_with_token", {
        p_project_id: projectId!,
        p_token: shareToken || null
      });

      const { data: existingTechStacks } = await supabase.rpc("get_project_tech_stacks_with_token", {
        p_project_id: projectId!,
        p_token: shareToken || null
      });

      // Calculate deltas for standards
      const existingStandardIds = new Set(existingStandards?.map(ps => ps.standard_id) || []);
      const standardsToAdd = Array.from(selectedStandards).filter(id => !existingStandardIds.has(id));
      const standardsToRemove = (existingStandards || []).filter(ps => !selectedStandards.has(ps.standard_id));

      // Calculate deltas for tech stacks - save each selected item ID directly (like standards)
      const existingTechStackIds = new Set((existingTechStacks || []).map((pts: any) => pts.tech_stack_id as string));
      const techStacksToAdd = Array.from(selectedTechStackItems).filter((id) => !existingTechStackIds.has(id));
      const techStacksToRemove = (existingTechStacks || []).filter((pts: any) => !selectedTechStackItems.has(pts.tech_stack_id as string));

      // Delete only removed standards
      for (const existing of standardsToRemove) {
        await supabase.rpc("delete_project_standard_with_token", {
          p_id: existing.id,
          p_token: shareToken || null
        });
      }

      // Insert only new standards
      for (const standardId of standardsToAdd) {
        await supabase.rpc("insert_project_standard_with_token", {
          p_project_id: projectId!,
          p_token: shareToken || null,
          p_standard_id: standardId
        });
      }

      // Delete only removed tech stacks
      for (const existing of techStacksToRemove) {
        await supabase.rpc("delete_project_tech_stack_with_token", {
          p_id: existing.id,
          p_token: shareToken || null
        });
      }

      // Insert only new tech stacks
      for (const techStackId of techStacksToAdd) {
        await supabase.rpc("insert_project_tech_stack_with_token", {
          p_project_id: projectId!,
          p_token: shareToken || null,
          p_tech_stack_id: techStackId
        });
      }

      toast.success("Project standards saved successfully");
      await loadData(); // Refresh to confirm changes
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error("Failed to save: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <div className="flex relative">
          <ProjectSidebar projectId={projectId!} />
          <div className="flex-1 w-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
        <main className="flex-1 w-full overflow-auto">
          <div className="container px-4 md:px-6 py-6 md:py-8 max-w-6xl">
            <ProjectPageHeader
              title="Project Standards"
              subtitle="Select applicable standards and tech stacks for this project"
              onMenuClick={() => setIsSidebarOpen(true)}
            />

            <div className="space-y-6">
              {/* Tech Stacks Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Tech Stacks</CardTitle>
                  <CardDescription>Select applicable technology stack items</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <TechStackTreeSelector
                      techStacks={techStacks.map(ts => ({ ...ts, items: [] }))}
                      selectedItems={selectedTechStackItems}
                      onSelectionChange={setSelectedTechStackItems}
                    />
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Standards Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Standards</CardTitle>
                  <CardDescription>
                    Select standards hierarchically - parent selections include all children
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <StandardsTreeSelector
                      categories={categories}
                      selectedStandards={selectedStandards}
                      onSelectionChange={setSelectedStandards}
                    />
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => { setSelectedStandards(new Set()); setSelectedTechStackItems(new Set()); }}>
                  Reset
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
