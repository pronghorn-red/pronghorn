import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Plus, Edit, Trash2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/contexts/AdminContext";

interface TechStackItem {
  id: string;
  type: string;
  name: string;
  description?: string | null;
  url?: string | null;
  version?: string | null;
  children?: TechStackItem[];
}

interface TechStackTreeManagerProps {
  techStackId: string;
  onRefresh: () => void;
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

export function TechStackTreeManager({ techStackId, onRefresh }: TechStackTreeManagerProps) {
  const { isAdmin, requestAdminAccess } = useAdmin();
  const [items, setItems] = useState<TechStackItem[]>([]);

  useEffect(() => {
    loadItems();
  }, [techStackId]);

  const loadItems = async () => {
    const { data } = await supabase
      .from("tech_stacks")
      .select("*")
      .eq("id", techStackId)
      .single();

    if (data?.metadata && typeof data.metadata === 'object' && 'items' in data.metadata) {
      setItems((data.metadata as any).items || []);
    }
  };

  const saveItems = async (newItems: TechStackItem[]) => {
    const { error } = await supabase
      .from("tech_stacks")
      .update({ 
        metadata: { items: newItems } as any,
        updated_at: new Date().toISOString()
      })
      .eq("id", techStackId);

    if (error) {
      toast.error("Failed to save items");
    } else {
      setItems(newItems);
      onRefresh();
    }
  };

  const handleAdd = async (parentId: string | null, type: string, name: string) => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required");
        return;
      }
    }

    const newItem: TechStackItem = {
      id: crypto.randomUUID(),
      type,
      name,
      children: [],
    };

    if (parentId === null) {
      await saveItems([...items, newItem]);
    } else {
      const addToParent = (items: TechStackItem[]): TechStackItem[] => {
        return items.map(item => {
          if (item.id === parentId) {
            return { ...item, children: [...(item.children || []), newItem] };
          }
          if (item.children) {
            return { ...item, children: addToParent(item.children) };
          }
          return item;
        });
      };
      await saveItems(addToParent(items));
    }
    toast.success("Item added");
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required");
        return;
      }
    }

    if (!confirm("Delete this item?")) return;

    const deleteItem = (items: TechStackItem[]): TechStackItem[] => {
      return items.filter(item => item.id !== id).map(item => ({
        ...item,
        children: item.children ? deleteItem(item.children) : []
      }));
    };

    await saveItems(deleteItem(items));
    toast.success("Item deleted");
  };

  const handleUpdate = async (id: string, updates: Partial<TechStackItem>) => {
    const updateItem = (items: TechStackItem[]): TechStackItem[] => {
      return items.map(item => {
        if (item.id === id) {
          return { ...item, ...updates };
        }
        if (item.children) {
          return { ...item, children: updateItem(item.children) };
        }
        return item;
      });
    };

    await saveItems(updateItem(items));
    toast.success("Item updated");
  };

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TechStackItemNode
          key={item.id}
          item={item}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      ))}
      <AddItemInline onAdd={(type, name) => handleAdd(null, type, name)} />
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
    <div className="flex items-center gap-2">
      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
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
        className="flex-1"
      />
      <Button size="sm" onClick={handleSubmit}>Add</Button>
      <Button size="sm" variant="outline" onClick={handleCancel}>Cancel</Button>
    </div>
  );
}

function TechStackItemNode({
  item,
  onAdd,
  onDelete,
  onUpdate,
}: {
  item: TechStackItem;
  onAdd: (parentId: string | null, type: string, name: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TechStackItem>) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");
  const [url, setUrl] = useState(item.url || "");
  const [version, setVersion] = useState(item.version || "");

  const handleSave = async () => {
    onUpdate(item.id, { name, description, url, version });
    setIsEditing(false);
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        {item.children && item.children.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        )}

        <div className="flex-1 space-y-2">
          {isEditing ? (
            <div className="space-y-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
                rows={2}
              />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="URL (optional)"
              />
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="Version (optional)"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{item.type}</Badge>
                    <span className="font-medium">{item.name}</span>
                    {item.version && <Badge variant="secondary" className="text-xs">v{item.version}</Badge>}
                  </div>
                  {item.description && (
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                  )}
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                      <LinkIcon className="h-3 w-3" />
                      {item.url}
                    </a>
                  )}
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setIsAddingChild(true)} title="Add sub-item">
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} title="Edit">
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)} title="Delete">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Children */}
      {(isExpanded || isAddingChild) && (
        <div className="ml-6 mt-2 space-y-2 border-l-2 border-border pl-4">
          {item.children && item.children.length > 0 && item.children.map((child) => (
            <TechStackItemNode key={child.id} item={child} onAdd={onAdd} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
          {isAddingChild && (
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
