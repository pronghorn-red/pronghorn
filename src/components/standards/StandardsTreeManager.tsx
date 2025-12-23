import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Edit, Trash2, Sparkles, Paperclip, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ResourceManager } from "@/components/resources/ResourceManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/contexts/AdminContext";

interface Standard {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  content?: string | null;
  children?: Standard[];
  attachments?: any[];
}

interface StandardsTreeManagerProps {
  standards: Standard[];
  categoryId: string;
  onRefresh: () => void;
}

export function StandardsTreeManager({ standards, categoryId, onRefresh }: StandardsTreeManagerProps) {
  const { isAdmin } = useAdmin();

  const handleAdd = async (parentId: string | null, title: string) => {
    if (!isAdmin) {
      toast.error("Admin access required");
      return;
    }

    const { error } = await supabase.from("standards").insert({
      category_id: categoryId,
      parent_id: parentId,
      title,
      code: `STD-${Date.now()}`,
    });

    if (error) {
      toast.error("Failed to create standard");
    } else {
      toast.success("Standard created");
      onRefresh();
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      toast.error("Admin access required");
      return;
    }

    if (!confirm("Delete this standard?")) return;

    const { error } = await supabase.from("standards").delete().eq("id", id);

    if (error) {
      toast.error("Failed to delete standard");
    } else {
      toast.success("Standard deleted");
      onRefresh();
    }
  };

  const handleAIExpand = async (parentId: string, parentTitle: string) => {
    if (!isAdmin) {
      toast.error("Admin access required");
      return;
    }

    toast.promise(
      (async () => {
        const { data, error } = await supabase.functions.invoke("expand-standards", {
          body: { standardId: parentId },
        });

        if (error) throw error;
        
        onRefresh();
        return data;
      })(),
      {
        loading: "AI expanding standard...",
        success: "Standard expanded successfully",
        error: "Failed to expand standard",
      }
    );
  };

  return (
    <div className="space-y-2">
      {standards.map((standard) => (
        <StandardNode
          key={standard.id}
          standard={standard}
          isAdmin={isAdmin}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onAIExpand={handleAIExpand}
          onRefresh={onRefresh}
        />
      ))}
      {isAdmin && <AddStandardInline onAdd={(title) => handleAdd(null, title)} />}
    </div>
  );
}

function AddStandardInline({ onAdd, onCancel }: { onAdd: (title: string) => void; onCancel?: () => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");

  const handleSubmit = () => {
    if (title.trim()) {
      onAdd(title);
      setTitle("");
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setTitle("");
    setIsAdding(false);
    onCancel?.();
  };

  if (!isAdding) {
    return (
      <Button variant="outline" size="sm" onClick={() => setIsAdding(true)} className="w-full">
        <Plus className="h-3 w-3 mr-2" />
        Add Standard
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Standard title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") handleCancel();
        }}
        autoFocus
      />
      <Button size="sm" onClick={handleSubmit}>Add</Button>
      <Button size="sm" variant="outline" onClick={handleCancel}>Cancel</Button>
    </div>
  );
}

function StandardNode({
  standard,
  isAdmin,
  onAdd,
  onDelete,
  onAIExpand,
  onRefresh,
}: {
  standard: Standard;
  isAdmin: boolean;
  onAdd: (parentId: string | null, title: string) => void;
  onDelete: (id: string) => void;
  onAIExpand: (parentId: string, parentTitle: string) => void;
  onRefresh: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [title, setTitle] = useState(standard.title);
  const [description, setDescription] = useState(standard.description || "");

  const handleSave = async () => {
    const { error } = await supabase
      .from("standards")
      .update({ title, description })
      .eq("id", standard.id);

    if (error) {
      toast.error("Failed to update standard");
    } else {
      toast.success("Standard updated");
      setIsEditing(false);
      onRefresh();
    }
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        {standard.children && standard.children.length > 0 && (
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
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
                rows={3}
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
                    <Badge variant="outline" className="text-xs">{standard.code}</Badge>
                    <span className="font-medium">{standard.title}</span>
                  </div>
                  {standard.description && (
                    <p className="text-sm text-muted-foreground mt-1">{standard.description}</p>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => setIsAddingChild(true)} title="Add sub-standard">
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} title="Edit">
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowResources(!showResources)} title="Resources">
                      <FolderOpen className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onAIExpand(standard.id, standard.title)} title="AI expand">
                      <Sparkles className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(standard.id)} title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Resources Section */}
              <Collapsible open={showResources} onOpenChange={setShowResources}>
                <CollapsibleContent className="mt-2">
                  <ResourceManager
                    entityType="standard"
                    entityId={standard.id}
                    onResourcesChange={onRefresh}
                  />
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </div>
      </div>

      {/* Children */}
      {(isExpanded || isAddingChild) && (
        <div className="ml-6 mt-2 space-y-2 border-l-2 border-border pl-4">
          {standard.children && standard.children.length > 0 && standard.children.map((child) => (
            <StandardNode key={child.id} standard={child} isAdmin={isAdmin} onAdd={onAdd} onDelete={onDelete} onAIExpand={onAIExpand} onRefresh={onRefresh} />
          ))}
          {isAddingChild && isAdmin && (
            <AddStandardInline 
              onAdd={(title) => {
                onAdd(standard.id, title);
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
