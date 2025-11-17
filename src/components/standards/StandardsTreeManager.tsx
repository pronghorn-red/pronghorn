import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Edit, Trash2, Sparkles, Link2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  const { isAdmin, requestAdminAccess } = useAdmin();

  const handleAdd = async (parentId: string | null) => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required");
        return;
      }
    }

    const title = prompt("Enter standard title:");
    if (!title) return;

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
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required");
        return;
      }
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

  const handleAIExpand = async (parentId: string) => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required");
        return;
      }
    }

    toast.info("AI expansion coming soon");
  };

  const handleAttachFile = async (standardId: string) => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required");
        return;
      }
    }

    toast.info("File attachment coming soon");
  };

  return (
    <div className="space-y-2">
      {standards.map((standard) => (
        <StandardNode
          key={standard.id}
          standard={standard}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onAIExpand={handleAIExpand}
          onAttachFile={handleAttachFile}
          onRefresh={onRefresh}
        />
      ))}
      <Button variant="outline" size="sm" onClick={() => handleAdd(null)} className="w-full">
        <Plus className="h-3 w-3 mr-2" />
        Add Root Standard
      </Button>
    </div>
  );
}

function StandardNode({
  standard,
  onAdd,
  onDelete,
  onAIExpand,
  onAttachFile,
  onRefresh,
}: {
  standard: Standard;
  onAdd: (parentId: string | null) => void;
  onDelete: (id: string) => void;
  onAIExpand: (parentId: string) => void;
  onAttachFile: (standardId: string) => void;
  onRefresh: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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

                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onAttachFile(standard.id)}
                  >
                    <Paperclip className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onAIExpand(standard.id)}
                  >
                    <Sparkles className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onAdd(standard.id)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onDelete(standard.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {standard.attachments && standard.attachments.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {standard.attachments.map((att) => (
                    <Badge key={att.id} variant="secondary" className="text-xs">
                      <Paperclip className="h-2 w-2 mr-1" />
                      {att.name}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isExpanded && standard.children && standard.children.length > 0 && (
        <div className="ml-6 space-y-2 border-l-2 border-border pl-3">
          {standard.children.map((child) => (
            <StandardNode
              key={child.id}
              standard={child}
              onAdd={onAdd}
              onDelete={onDelete}
              onAIExpand={onAIExpand}
              onAttachFile={onAttachFile}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
