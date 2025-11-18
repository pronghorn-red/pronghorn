import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";

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
  const [selectedTechStacks, setSelectedTechStacks] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedStandards, setExpandedStandards] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      setSelectedTechStacks(new Set(projectTechStacks?.map((pts) => pts.tech_stack_id) || []));
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

  const getAllDescendants = (standard: Standard): string[] => {
    const ids: string[] = [standard.id];
    if (standard.children) {
      standard.children.forEach((child) => {
        ids.push(...getAllDescendants(child));
      });
    }
    return ids;
  };

  const toggleStandard = (standard: Standard, checked: boolean) => {
    const descendantIds = getAllDescendants(standard);
    const newSelected = new Set(selectedStandards);

    if (checked) {
      descendantIds.forEach((id) => newSelected.add(id));
    } else {
      descendantIds.forEach((id) => newSelected.delete(id));
    }

    setSelectedStandards(newSelected);
  };

  const toggleTechStack = (techStackId: string) => {
    const newSelected = new Set(selectedTechStacks);
    if (newSelected.has(techStackId)) {
      newSelected.delete(techStackId);
    } else {
      newSelected.add(techStackId);
    }
    setSelectedTechStacks(newSelected);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Get existing project standards and tech stacks to delete
      const { data: existingStandards } = await supabase.rpc("get_project_standards_with_token", {
        p_project_id: projectId!,
        p_token: shareToken || null
      });

      const { data: existingTechStacks } = await supabase.rpc("get_project_tech_stacks_with_token", {
        p_project_id: projectId!,
        p_token: shareToken || null
      });

      // Delete all existing project standards
      if (existingStandards && existingStandards.length > 0) {
        for (const existing of existingStandards) {
          await supabase.rpc("delete_project_standard_with_token", {
            p_id: existing.id,
            p_token: shareToken || null
          });
        }
      }

      // Insert new selections for standards
      if (selectedStandards.size > 0) {
        for (const standardId of Array.from(selectedStandards)) {
          await supabase.rpc("insert_project_standard_with_token", {
            p_project_id: projectId!,
            p_token: shareToken || null,
            p_standard_id: standardId
          });
        }
      }

      // Delete all existing project tech stacks
      if (existingTechStacks && existingTechStacks.length > 0) {
        for (const existing of existingTechStacks) {
          await supabase.rpc("delete_project_tech_stack_with_token", {
            p_id: existing.id,
            p_token: shareToken || null
          });
        }
      }

      // Insert new selections for tech stacks
      if (selectedTechStacks.size > 0) {
        for (const techStackId of Array.from(selectedTechStacks)) {
          await supabase.rpc("insert_project_tech_stack_with_token", {
            p_project_id: projectId!,
            p_token: shareToken || null,
            p_tech_stack_id: techStackId
          });
        }
      }

      toast.success("Project standards saved successfully");
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderStandard = (standard: Standard, level: number = 0) => {
    const isExpanded = expandedStandards.has(standard.id);
    const hasChildren = standard.children && standard.children.length > 0;
    const isChecked = selectedStandards.has(standard.id);

    return (
      <div key={standard.id} style={{ marginLeft: `${level * 24}px` }}>
        <div className="flex items-center gap-2 py-2 hover:bg-muted/50 rounded px-2">
          {hasChildren && (
            <button
              onClick={() => {
                const newExpanded = new Set(expandedStandards);
                if (isExpanded) {
                  newExpanded.delete(standard.id);
                } else {
                  newExpanded.add(standard.id);
                }
                setExpandedStandards(newExpanded);
              }}
              className="p-0 h-4 w-4"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
          {!hasChildren && <div className="w-4" />}
          <Checkbox
            id={standard.id}
            checked={isChecked}
            onCheckedChange={(checked) => toggleStandard(standard, checked as boolean)}
          />
          <Label htmlFor={standard.id} className="flex-1 cursor-pointer">
            <div className="font-medium text-sm">{standard.code} - {standard.title}</div>
            {standard.description && (
              <div className="text-xs text-muted-foreground">{standard.description}</div>
            )}
          </Label>
        </div>
        {isExpanded && hasChildren && (
          <div>
            {standard.children!.map((child) => renderStandard(child, level + 1))}
          </div>
        )}
      </div>
    );
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
        <ProjectSidebar projectId={projectId!} />
        <main className="flex-1 w-full overflow-auto">
          <div className="container px-6 py-8 max-w-6xl">
            <h1 className="text-3xl font-bold mb-2">Project Standards</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Select applicable standards and tech stacks for this project
            </p>
            {/* Tech Stacks Section */}
            <Card>
              <CardHeader>
                <CardTitle>Tech Stacks</CardTitle>
                <CardDescription>Select applicable technology stacks</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {techStacks.map((stack) => (
                      <div
                        key={stack.id}
                        className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`tech-${stack.id}`}
                          checked={selectedTechStacks.has(stack.id)}
                          onCheckedChange={() => toggleTechStack(stack.id)}
                        />
                        <Label htmlFor={`tech-${stack.id}`} className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            {stack.icon && <span>{stack.icon}</span>}
                            <div>
                              <div className="font-medium">{stack.name}</div>
                              {stack.description && (
                                <div className="text-xs text-muted-foreground">{stack.description}</div>
                              )}
                            </div>
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Standards Section */}
            <Card>
              <CardHeader>
                <CardTitle>Standards</CardTitle>
                <CardDescription>
                  Select high-level standards (sub-standards are included automatically)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-6">
                    {categories.map((category) => {
                      const isExpanded = expandedCategories.has(category.id);
                      return (
                        <div key={category.id}>
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedCategories);
                              if (isExpanded) {
                                newExpanded.delete(category.id);
                              } else {
                                newExpanded.add(category.id);
                              }
                              setExpandedCategories(newExpanded);
                            }}
                            className="flex items-center gap-2 w-full p-2 hover:bg-muted rounded"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronRight className="h-5 w-5" />
                            )}
                            {category.icon && <span className="text-lg">{category.icon}</span>}
                            <div className="text-left">
                              <div className="font-semibold">{category.name}</div>
                              {category.description && (
                                <div className="text-xs text-muted-foreground">{category.description}</div>
                              )}
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="mt-2 pl-4">
                              {category.standards.map((standard) => renderStandard(standard))}
                            </div>
                          )}
                          <Separator className="mt-4" />
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={loadData}>
                Reset
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
