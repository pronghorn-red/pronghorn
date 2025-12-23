import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Plus, Edit, Trash2, FolderOpen, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ResourceManager } from "@/components/resources/ResourceManager";
import { EditTechStackItemDialog } from "./EditTechStackItemDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/contexts/AdminContext";

interface TechStackItem {
  id: string;
  type: string | null;
  name: string;
  description?: string | null;
  long_description?: string | null;
  version?: string | null;
  version_constraint?: string | null;
  parent_id?: string | null;
  children?: TechStackItem[];
}

interface TechStackTreeManagerProps {
  techStackId: string;
  onRefresh: () => void;
  onViewDocs?: (item: TechStackItem) => void;
}

export function TechStackTreeManager({ techStackId, onRefresh, onViewDocs }: TechStackTreeManagerProps) {
  const { isAdmin } = useAdmin();
  const [items, setItems] = useState<TechStackItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [addingParentId, setAddingParentId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    loadItems();
  }, [techStackId]);

  const loadItems = async () => {
    const { data } = await supabase
      .from("tech_stacks")
      .select("*")
      .eq("parent_id", techStackId)
      .order("name");

    if (data) {
      setItems(buildHierarchy(data));
    }
  };

  const buildHierarchy = (flatItems: any[]): TechStackItem[] => {
    const map = new Map<string, TechStackItem>();
    const roots: TechStackItem[] = [];

    flatItems.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    flatItems.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_id && item.parent_id !== techStackId && map.has(item.parent_id)) {
        map.get(item.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    // Sort alphabetically by name
    const sortByName = (a: TechStackItem, b: TechStackItem) => 
      (a.name || '').localeCompare(b.name || '');

    const sortChildren = (items: TechStackItem[]) => {
      items.sort(sortByName);
      items.forEach(item => {
        if (item.children?.length) {
          sortChildren(item.children);
        }
      });
    };

    sortChildren(roots);
    return roots;
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      toast.error("Admin access required");
      return;
    }

    if (!confirm("Delete this item and all its children?")) return;

    const { error } = await supabase.from("tech_stacks").delete().eq("id", id);

    if (error) {
      toast.error("Failed to delete item");
    } else {
      toast.success("Item deleted");
      loadItems();
      onRefresh();
    }
  };

  const handleDialogClose = () => {
    setEditingItemId(null);
    setAddingParentId(undefined);
    loadItems();
  };

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TechStackItemNode
          key={item.id}
          item={item}
          isAdmin={isAdmin}
          onEdit={(id) => setEditingItemId(id)}
          onAdd={(parentId) => setAddingParentId(parentId)}
          onDelete={handleDelete}
          onViewDocs={onViewDocs}
        />
      ))}
      {isAdmin && (
        <Button variant="outline" size="sm" onClick={() => setAddingParentId(techStackId)} className="w-full">
          <Plus className="h-3 w-3 mr-2" />
          Add Item
        </Button>
      )}

      {/* Edit Dialog */}
      <EditTechStackItemDialog
        open={editingItemId !== null}
        onClose={handleDialogClose}
        itemId={editingItemId || undefined}
        onRefresh={() => { loadItems(); onRefresh(); }}
      />

      {/* Add Dialog */}
      <EditTechStackItemDialog
        open={addingParentId !== undefined}
        onClose={handleDialogClose}
        parentId={addingParentId || undefined}
        onRefresh={() => { loadItems(); onRefresh(); }}
      />
    </div>
  );
}

function TechStackItemNode({
  item,
  isAdmin,
  onEdit,
  onAdd,
  onDelete,
  onViewDocs,
}: {
  item: TechStackItem;
  isAdmin: boolean;
  onEdit: (id: string) => void;
  onAdd: (parentId: string) => void;
  onDelete: (id: string) => void;
  onViewDocs?: (item: TechStackItem) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showResources, setShowResources] = useState(false);

  const versionDisplay = item.version ? `${item.version_constraint || "^"}${item.version}` : null;

  return (
    <div className="border border-border rounded-lg p-2 md:p-3 space-y-2">
      <div className="flex items-start gap-1 md:gap-2">
        {item.children && item.children.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 md:h-6 md:w-6 flex-shrink-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="h-2.5 w-2.5 md:h-3 md:w-3" /> : <ChevronRight className="h-2.5 w-2.5 md:h-3 md:w-3" />}
          </Button>
        )}

        <div className="flex-1 min-w-0 space-y-2 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                {item.type && <Badge variant="outline" className="text-[10px] md:text-xs flex-shrink-0">{item.type}</Badge>}
                <span className="font-medium text-sm md:text-base truncate">{item.name}</span>
                {versionDisplay && (
                  <Badge variant="secondary" className="text-[10px] md:text-xs font-mono">
                    {versionDisplay}
                  </Badge>
                )}
              </div>
              {item.description && (
                <p className="text-xs md:text-sm text-muted-foreground mt-1 break-words">{item.description}</p>
              )}
            </div>

            <div className="flex gap-0.5 md:gap-1 flex-shrink-0">
              {item.long_description && onViewDocs && (
                <Button variant="ghost" size="sm" onClick={() => onViewDocs(item)} title="View docs" className="h-7 w-7 md:h-8 md:w-8 p-0">
                  <BookOpen className="h-2.5 w-2.5 md:h-3 md:w-3" />
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onAdd(item.id)} title="Add sub-item" className="h-7 w-7 md:h-8 md:w-8 p-0">
                    <Plus className="h-2.5 w-2.5 md:h-3 md:w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(item.id)} title="Edit" className="h-7 w-7 md:h-8 md:w-8 p-0">
                    <Edit className="h-2.5 w-2.5 md:h-3 md:w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowResources(!showResources)} title="Resources" className="h-7 w-7 md:h-8 md:w-8 p-0">
                    <FolderOpen className="h-2.5 w-2.5 md:h-3 md:w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)} title="Delete" className="h-7 w-7 md:h-8 md:w-8 p-0">
                    <Trash2 className="h-2.5 w-2.5 md:h-3 md:w-3" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Resources Section */}
          <Collapsible open={showResources} onOpenChange={setShowResources}>
            <CollapsibleContent className="mt-2">
              <ResourceManager
                entityType="tech_stack"
                entityId={item.id}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Children */}
      {isExpanded && item.children && item.children.length > 0 && (
        <div className="ml-3 md:ml-6 mt-2 space-y-2 border-l-2 border-border pl-2 md:pl-4">
          {item.children.map((child) => (
            <TechStackItemNode
              key={child.id}
              item={child}
              isAdmin={isAdmin}
              onEdit={onEdit}
              onAdd={onAdd}
              onDelete={onDelete}
              onViewDocs={onViewDocs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
