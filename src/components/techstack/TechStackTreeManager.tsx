import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Plus, Edit, Trash2, FolderOpen, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ResourceManager } from "@/components/resources/ResourceManager";
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

const ITEM_TYPES = [
  "Language",
  "Framework",
  "Library",
  "Plugin",
  "IDE",
  "Tool",
  "Component",
  "Resource",
  "Website",
  "Other"
];

const VERSION_CONSTRAINTS = [
  { value: "^", label: "^  (Compatible)" },
  { value: "~", label: "~  (Patch only)" },
  { value: ">=", label: ">= (Or higher)" },
  { value: "=", label: "=  (Exact)" },
  { value: "latest", label: "latest" },
];

export function TechStackTreeManager({ techStackId, onRefresh, onViewDocs }: TechStackTreeManagerProps) {
  const { isAdmin } = useAdmin();
  const [items, setItems] = useState<TechStackItem[]>([]);

  useEffect(() => {
    loadItems();
  }, [techStackId]);

  const loadItems = async () => {
    const { data } = await supabase
      .from("tech_stacks")
      .select("*")
      .eq("parent_id", techStackId)
      .order("order_index");

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

    return roots;
  };

  const handleAdd = async (parentId: string | null, type: string, name: string) => {
    if (!isAdmin) {
      toast.error("Admin access required");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", user?.id).single();

    const { error } = await supabase.from("tech_stacks").insert({
      name,
      type,
      parent_id: parentId || techStackId,
      org_id: profile?.org_id || null,
      created_by: user?.id,
    });

    if (error) {
      toast.error("Failed to add item");
    } else {
      toast.success("Item added");
      loadItems();
      onRefresh();
    }
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

  const handleUpdate = async (id: string, updates: Partial<TechStackItem>) => {
    if (!isAdmin) {
      toast.error("Admin access required");
      return;
    }

    const { error } = await supabase
      .from("tech_stacks")
      .update(updates)
      .eq("id", id);

    if (error) {
      toast.error("Failed to update item");
    } else {
      toast.success("Item updated");
      loadItems();
      onRefresh();
    }
  };

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TechStackItemNode
          key={item.id}
          item={item}
          isAdmin={isAdmin}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onViewDocs={onViewDocs}
        />
      ))}
      {isAdmin && <AddItemInline onAdd={(type, name) => handleAdd(null, type, name)} />}
    </div>
  );
}

function AddItemInline({ onAdd, onCancel }: { onAdd: (type: string, name: string) => void; onCancel?: () => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [type, setType] = useState("Library");
  const [name, setName] = useState("");

  const handleSubmit = () => {
    if (name.trim()) {
      onAdd(type, name);
      setName("");
      setType("Library");
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setName("");
    setType("Library");
    setIsAdding(false);
    onCancel?.();
  };

  if (!isAdding) {
    return (
      <Button variant="outline" size="sm" onClick={() => setIsAdding(true)} className="w-full">
        <Plus className="h-3 w-3 mr-2" />
        Add Item
      </Button>
    );
  }

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="w-full md:w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-background z-50">
          {ITEM_TYPES.map(t => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="Name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") handleCancel();
        }}
        autoFocus
        className="flex-1 text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} className="flex-1 md:flex-none">Add</Button>
        <Button size="sm" variant="outline" onClick={handleCancel} className="flex-1 md:flex-none">Cancel</Button>
      </div>
    </div>
  );
}

function TechStackItemNode({
  item,
  isAdmin,
  onAdd,
  onDelete,
  onUpdate,
  onViewDocs,
}: {
  item: TechStackItem;
  isAdmin: boolean;
  onAdd: (parentId: string | null, type: string, name: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TechStackItem>) => void;
  onViewDocs?: (item: TechStackItem) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");
  const [version, setVersion] = useState(item.version || "");
  const [versionConstraint, setVersionConstraint] = useState(item.version_constraint || "^");

  const handleSave = async () => {
    onUpdate(item.id, { name, description, version: version || null, version_constraint: versionConstraint });
    setIsEditing(false);
  };

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
          {isEditing ? (
            <div className="space-y-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="text-sm"
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description"
                rows={2}
                className="text-sm"
              />
              {/* Version fields */}
              <div className="flex gap-2 items-center">
                <Select value={versionConstraint} onValueChange={setVersionConstraint}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {VERSION_CONSTRAINTS.map(vc => (
                      <SelectItem key={vc.value} value={vc.value}>{vc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="Version (e.g., 3.4.0)"
                  className="flex-1 text-sm"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={handleSave}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
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
                      <Button variant="ghost" size="sm" onClick={() => setIsAddingChild(true)} title="Add sub-item" className="h-7 w-7 md:h-8 md:w-8 p-0">
                        <Plus className="h-2.5 w-2.5 md:h-3 md:w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} title="Edit" className="h-7 w-7 md:h-8 md:w-8 p-0">
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
            </>
          )}
        </div>
      </div>

      {/* Children */}
      {(isExpanded || isAddingChild) && (
        <div className="ml-3 md:ml-6 mt-2 space-y-2 border-l-2 border-border pl-2 md:pl-4">
          {item.children && item.children.length > 0 && item.children.map((child) => (
            <TechStackItemNode key={child.id} item={child} isAdmin={isAdmin} onAdd={onAdd} onDelete={onDelete} onUpdate={onUpdate} onViewDocs={onViewDocs} />
          ))}
          {isAddingChild && isAdmin && (
            <AddItemInline 
              onAdd={(type, name) => {
                onAdd(item.id, type, name);
                setIsAddingChild(false);
                setIsExpanded(true);
              }} 
              onCancel={() => setIsAddingChild(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
