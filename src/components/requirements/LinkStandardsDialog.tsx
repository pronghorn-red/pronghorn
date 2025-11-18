import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, ChevronDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

interface LinkStandardsDialogProps {
  open: boolean;
  onClose: () => void;
  requirementId: string;
  requirementTitle: string;
}

interface Standard {
  id: string;
  code: string;
  title: string;
  children?: Standard[];
}

interface Category {
  id: string;
  name: string;
  icon?: string;
  standards: Standard[];
}

export function LinkStandardsDialog({ open, onClose, requirementId, requirementTitle }: LinkStandardsDialogProps) {
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedStandards, setExpandedStandards] = useState<Set<string>>(new Set());
  const [linkedStandards, setLinkedStandards] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, requirementId]);

  const loadData = async () => {
    const { data: categoriesData } = await supabase
      .from("standard_categories")
      .select("*")
      .order("order_index");

    const { data: standardsData } = await supabase
      .from("standards")
      .select("id, code, title, category_id, parent_id")
      .order("code");

    const { data: linkedData } = await supabase.rpc("get_requirement_standards_with_token", {
      p_requirement_id: requirementId,
      p_token: shareToken || null
    });

    if (linkedData) {
      setLinkedStandards(new Set(linkedData.map((l: any) => l.standard_id)));
    }

    if (categoriesData && standardsData) {
      const buildTree = (parentId: string | null): Standard[] => {
        return standardsData
          .filter((s) => s.parent_id === parentId)
          .map((s) => ({
            id: s.id,
            code: s.code,
            title: s.title,
            children: buildTree(s.id),
          }));
      };

      const categoriesWithStandards = categoriesData.map((cat) => ({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        standards: standardsData
          .filter((s) => s.category_id === cat.id && !s.parent_id)
          .map((s) => ({
            id: s.id,
            code: s.code,
            title: s.title,
            children: buildTree(s.id),
          })),
      }));

      setCategories(categoriesWithStandards);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const toggleStandard = (standardId: string) => {
    setExpandedStandards((prev) => {
      const next = new Set(prev);
      if (next.has(standardId)) {
        next.delete(standardId);
      } else {
        next.add(standardId);
      }
      return next;
    });
  };

  const handleLinkStandard = async (standardId: string) => {
    const isLinked = linkedStandards.has(standardId);

    try {
      if (isLinked) {
        // Find the link to delete
        const { data: existingLinks } = await supabase.rpc("get_requirement_standards_with_token", {
          p_requirement_id: requirementId,
          p_token: shareToken || null
        });

        const linkToDelete = existingLinks?.find((l: any) => l.standard_id === standardId);
        if (!linkToDelete) {
          toast.error("Link not found");
          return;
        }

        await supabase.rpc("delete_requirement_standard_with_token", {
          p_id: linkToDelete.id,
          p_token: shareToken || null
        });

        setLinkedStandards((prev) => {
          const next = new Set(prev);
          next.delete(standardId);
          return next;
        });
        toast.success("Standard unlinked");
      } else {
        await supabase.rpc("insert_requirement_standard_with_token", {
          p_requirement_id: requirementId,
          p_token: shareToken || null,
          p_standard_id: standardId,
          p_notes: null
        });

        setLinkedStandards((prev) => new Set(prev).add(standardId));
        toast.success("Standard linked");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update standard link");
    }
  };

  const renderStandard = (standard: Standard, level: number = 0) => {
    const isExpanded = expandedStandards.has(standard.id);
    const isLinked = linkedStandards.has(standard.id);
    const hasChildren = standard.children && standard.children.length > 0;

    return (
      <div key={standard.id}>
        <div
          className="flex items-center gap-2 py-2 px-2 hover:bg-muted/50 rounded-md"
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {hasChildren && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 flex-shrink-0"
              onClick={() => toggleStandard(standard.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          )}
          {!hasChildren && <div className="w-5" />}

          <Badge variant="outline" className="text-xs font-mono flex-shrink-0">
            {standard.code}
          </Badge>
          <span className="text-sm flex-1">{standard.title}</span>

          <Button
            variant={isLinked ? "default" : "outline"}
            size="sm"
            onClick={() => handleLinkStandard(standard.id)}
          >
            {isLinked ? "Linked" : "Link"}
          </Button>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {standard.children!.map((child) => renderStandard(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredCategories = searchQuery
    ? categories.map((cat) => ({
        ...cat,
        standards: cat.standards.filter(
          (s) =>
            s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.code.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter((cat) => cat.standards.length > 0)
    : categories;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Link Standards</DialogTitle>
          <DialogDescription>
            Link organizational standards to: {requirementTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search standards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[50vh]">
            <div className="space-y-4">
              {filteredCategories.map((category) => (
                <div key={category.id} className="border rounded-lg p-3">
                  <div
                    className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded-md"
                    onClick={() => toggleCategory(category.id)}
                  >
                    {expandedCategories.has(category.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    {category.icon && <span className="text-lg">{category.icon}</span>}
                    <h3 className="font-semibold">{category.name}</h3>
                    <Badge variant="secondary" className="ml-auto">
                      {category.standards.length}
                    </Badge>
                  </div>

                  {expandedCategories.has(category.id) && (
                    <div className="mt-2 space-y-1">
                      {category.standards.map((standard) => renderStandard(standard))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
