import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, Edit2, FileText, ListTodo, CheckSquare, FileCheck, Sparkles, Link as LinkIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type RequirementType = "EPIC" | "FEATURE" | "STORY" | "ACCEPTANCE_CRITERIA";

export interface Requirement {
  id: string;
  code?: string;
  type: RequirementType;
  title: string;
  content?: string;
  children?: Requirement[];
}

interface RequirementsTreeProps {
  requirements: Requirement[];
  projectId: string;
  onNodeUpdate?: (id: string, updates: Partial<Requirement>) => void;
  onNodeDelete?: (id: string) => void;
  onNodeAdd?: (parentId: string | null, type: RequirementType) => void;
  onExpand?: () => void;
  onLinkStandard?: (id: string, title: string) => void;
}

const typeIcons = { EPIC: FileText, FEATURE: ListTodo, STORY: CheckSquare, ACCEPTANCE_CRITERIA: FileCheck };
const typeColors = {
  EPIC: "bg-purple-500/10 text-purple-700 border-purple-500/20",
  FEATURE: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  STORY: "bg-green-500/10 text-green-700 border-green-500/20",
  ACCEPTANCE_CRITERIA: "bg-orange-500/10 text-orange-700 border-orange-500/20",
};

function getNextType(type: RequirementType): RequirementType | null {
  const map = { EPIC: "FEATURE", FEATURE: "STORY", STORY: "ACCEPTANCE_CRITERIA" };
  return (map[type] as RequirementType) || null;
}

function RequirementNode({ requirement, level = 0, projectId, onUpdate, onDelete, onAdd, onExpand, onLinkStandard }: any) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(requirement.title);
  const [editContent, setEditContent] = useState(requirement.content || "");
  const [isExpanding, setIsExpanding] = useState(false);
  const Icon = typeIcons[requirement.type];
  const hasChildren = requirement.children?.length > 0;

  const handleAIExpand = async () => {
    if (requirement.type === "ACCEPTANCE_CRITERIA") return toast.error("Cannot expand further");
    setIsExpanding(true);
    try {
      const { data, error } = await supabase.functions.invoke("expand-requirement", { body: { requirementId: requirement.id } });
      if (error) throw error;
      toast.success(`Added ${data.count} sub-requirements`);
      onExpand?.();
    } catch (error: any) {
      toast.error(error.message || "Expansion failed");
    } finally {
      setIsExpanding(false);
    }
  };

  return (
    <div className="select-none">
      {isEditing ? (
        <div className="p-4 bg-muted/30 rounded-md space-y-3 border" style={{ marginLeft: `${level * 20}px` }}>
          <div className="flex gap-2">
            {requirement.code && <Badge variant="outline" className="font-mono text-xs">{requirement.code}</Badge>}
            <Badge variant="outline" className={typeColors[requirement.type]}>{requirement.type.replace("_", " ")}</Badge>
          </div>
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
          <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { onUpdate?.(requirement.id, { title: editTitle, content: editContent }); setIsEditing(false); }}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="group flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50" style={{ paddingLeft: `${level * 20 + 8}px` }}>
          {hasChildren ? <Button variant="ghost" size="icon" className="h-5 w-5 p-0" onClick={() => setIsExpanded(!isExpanded)}>{isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</Button> : <div className="h-5 w-5" />}
          <div className={`p-1 rounded ${typeColors[requirement.type]}`}><Icon className="h-3 w-3" /></div>
          <div className="flex gap-2">{requirement.code && <Badge variant="outline" className="font-mono text-xs">{requirement.code}</Badge>}<Badge variant="outline" className={typeColors[requirement.type]}>{requirement.type.replace("_", " ")}</Badge></div>
          <div className="flex-1 min-w-0"><span className="text-sm font-medium">{requirement.title}</span>{requirement.content && <p className="text-xs text-muted-foreground mt-1">{requirement.content}</p>}</div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditing(true)}><Edit2 className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAIExpand} disabled={isExpanding}>{isExpanding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}</Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onLinkStandard?.(requirement.id, requirement.title)}><LinkIcon className="h-3 w-3" /></Button>
            {getNextType(requirement.type) && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onAdd?.(requirement.id, getNextType(requirement.type)!)}><Plus className="h-3 w-3" /></Button>}
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete?.(requirement.id)}><Trash2 className="h-3 w-3" /></Button>
          </div>
        </div>
      )}
      {isExpanded && hasChildren && <div>{requirement.children!.map((child: any) => <RequirementNode key={child.id} requirement={child} level={level + 1} projectId={projectId} onUpdate={onUpdate} onDelete={onDelete} onAdd={onAdd} onExpand={onExpand} onLinkStandard={onLinkStandard} />)}</div>}
    </div>
  );
}

export function RequirementsTree(props: RequirementsTreeProps) {
  return <div className="space-y-1">{props.requirements.map((req) => <RequirementNode key={req.id} requirement={req} {...props} />)}</div>;
}
