import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Requirement {
  id: string;
  code: string | null;
  title: string;
  type: string;
  parent_id: string | null;
  children?: Requirement[];
}

interface RequirementsTreeSelectorProps {
  projectId: string;
  shareToken: string | null;
  selectedRequirements: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
}

export function RequirementsTreeSelector({
  projectId,
  shareToken,
  selectedRequirements,
  onSelectionChange
}: RequirementsTreeSelectorProps) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequirements();
  }, [projectId]);

  const loadRequirements = async () => {
    try {
      const { data } = await supabase.rpc("get_requirements_with_token", {
        p_project_id: projectId,
        p_token: shareToken
      });

      if (data) {
        setRequirements(buildHierarchy(data));
      }
    } catch (error) {
      console.error("Error loading requirements:", error);
    } finally {
      setLoading(false);
    }
  };

  const buildHierarchy = (flatList: any[]): Requirement[] => {
    const map = new Map<string, Requirement>();
    const roots: Requirement[] = [];

    flatList.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    flatList.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const getAllDescendants = (req: Requirement): string[] => {
    const descendants: string[] = [req.id];
    if (req.children) {
      req.children.forEach((child) => {
        descendants.push(...getAllDescendants(child));
      });
    }
    return descendants;
  };

  const areAllDescendantsSelected = (req: Requirement): boolean => {
    const descendants = getAllDescendants(req);
    return descendants.every((id) => selectedRequirements.has(id));
  };

  const areSomeDescendantsSelected = (req: Requirement): boolean => {
    const descendants = getAllDescendants(req);
    const selectedCount = descendants.filter((id) => selectedRequirements.has(id)).length;
    return selectedCount > 0 && selectedCount < descendants.length;
  };

  const toggleRequirement = (req: Requirement) => {
    const newSelected = new Set(selectedRequirements);
    const hasChildren = req.children && req.children.length > 0;

    if (!hasChildren) {
      if (newSelected.has(req.id)) {
        newSelected.delete(req.id);
      } else {
        newSelected.add(req.id);
      }
    } else {
      const descendants = getAllDescendants(req);
      const allSelected = areAllDescendantsSelected(req);

      if (allSelected) {
        descendants.forEach((id) => newSelected.delete(id));
      } else {
        descendants.forEach((id) => newSelected.add(id));
      }
    }

    onSelectionChange(newSelected);
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const handleSelectAll = () => {
    const allIds = new Set<string>();
    const collectIds = (reqs: Requirement[]) => {
      reqs.forEach((req) => {
        allIds.add(req.id);
        if (req.children) {
          collectIds(req.children);
        }
      });
    };
    collectIds(requirements);
    onSelectionChange(allIds);
  };

  const handleSelectNone = () => {
    onSelectionChange(new Set());
  };

  const renderRequirement = (req: Requirement, level: number = 0) => {
    const isExpanded = expandedItems.has(req.id);
    const hasChildren = req.children && req.children.length > 0;
    const isChecked = hasChildren
      ? areAllDescendantsSelected(req)
      : selectedRequirements.has(req.id);
    const isIndeterminate = hasChildren && !isChecked && areSomeDescendantsSelected(req);

    return (
      <div key={req.id} className="space-y-1">
        <div
          className="flex items-center gap-2 py-1 hover:bg-muted/50 rounded px-2"
          style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
        >
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => toggleExpand(req.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          )}
          {!hasChildren && <div className="w-5" />}
          <Checkbox
            id={`req-${req.id}`}
            checked={isIndeterminate ? "indeterminate" : isChecked}
            onCheckedChange={() => toggleRequirement(req)}
          />
          <Label
            htmlFor={`req-${req.id}`}
            className="text-sm cursor-pointer flex-1"
          >
            {req.code && <span className="font-medium">{req.code} - </span>}
            {req.title}
          </Label>
        </div>
        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {req.children!.map((child) => renderRequirement(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading requirements...</div>;
  }

  if (requirements.length === 0) {
    return <div className="text-sm text-muted-foreground">No requirements in this project.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button variant="outline" size="sm" onClick={handleSelectNone}>
          Select None
        </Button>
      </div>
      <div className="space-y-1">
        {requirements.map((req) => renderRequirement(req, 0))}
      </div>
    </div>
  );
}
