import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Edit, Trash2, Sparkles, FolderOpen, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ResourceManager } from "@/components/resources/ResourceManager";
import { EditStandardDialog } from "./EditStandardDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/contexts/AdminContext";

interface Standard {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  long_description?: string | null;
  content?: string | null;
  children?: Standard[];
  attachments?: any[];
}

interface StandardsTreeManagerProps {
  standards: Standard[];
  categoryId: string;
  onRefresh: () => void;
  onViewDocs?: (standard: Standard) => void;
}

export function StandardsTreeManager({ standards, categoryId, onRefresh, onViewDocs }: StandardsTreeManagerProps) {
  const { isAdmin } = useAdmin();
  const [editingStandardId, setEditingStandardId] = useState<string | null>(null);
  const [addingParentId, setAddingParentId] = useState<string | null | undefined>(undefined);

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
          onEdit={(id) => setEditingStandardId(id)}
          onAdd={(parentId) => setAddingParentId(parentId)}
          onDelete={handleDelete}
          onAIExpand={handleAIExpand}
          onRefresh={onRefresh}
          onViewDocs={onViewDocs}
        />
      ))}
      {isAdmin && <AddStandardInline onAdd={() => setAddingParentId(null)} />}

      {/* Edit Dialog */}
      <EditStandardDialog
        open={editingStandardId !== null}
        onClose={() => setEditingStandardId(null)}
        standardId={editingStandardId || undefined}
        categoryId={categoryId}
        onRefresh={onRefresh}
      />

      {/* Add Dialog */}
      <EditStandardDialog
        open={addingParentId !== undefined}
        onClose={() => setAddingParentId(undefined)}
        parentId={addingParentId || undefined}
        categoryId={categoryId}
        onRefresh={onRefresh}
      />
    </div>
  );
}

function AddStandardInline({ onAdd }: { onAdd: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onAdd} className="w-full">
      <Plus className="h-3 w-3 mr-2" />
      Add Standard
    </Button>
  );
}

function StandardNode({
  standard,
  isAdmin,
  onEdit,
  onAdd,
  onDelete,
  onAIExpand,
  onRefresh,
  onViewDocs,
}: {
  standard: Standard;
  isAdmin: boolean;
  onEdit: (id: string) => void;
  onAdd: (parentId: string) => void;
  onDelete: (id: string) => void;
  onAIExpand: (parentId: string, parentTitle: string) => void;
  onRefresh: () => void;
  onViewDocs?: (standard: Standard) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showResources, setShowResources] = useState(false);

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
              {standard.long_description && onViewDocs && (
                <Button variant="ghost" size="sm" onClick={() => onViewDocs(standard)} title="View docs">
                  <BookOpen className="h-3 w-3" />
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onAdd(standard.id)} title="Add sub-standard">
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(standard.id)} title="Edit">
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
                </>
              )}
            </div>
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
        </div>
      </div>

      {/* Children */}
      {isExpanded && standard.children && standard.children.length > 0 && (
        <div className="ml-6 mt-2 space-y-2 border-l-2 border-border pl-4">
          {standard.children.map((child) => (
            <StandardNode
              key={child.id}
              standard={child}
              isAdmin={isAdmin}
              onEdit={onEdit}
              onAdd={onAdd}
              onDelete={onDelete}
              onAIExpand={onAIExpand}
              onRefresh={onRefresh}
              onViewDocs={onViewDocs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
