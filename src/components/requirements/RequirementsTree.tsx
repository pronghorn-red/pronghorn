import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, Edit2, FileText, ListTodo, CheckSquare, FileCheck, Sparkles, Link as LinkIcon, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RequirementStandardsBadges } from "./RequirementStandardsBadges";
import { SourceRequirementsUpload } from "./SourceRequirementsUpload";
import { useRequirementFiles } from "@/hooks/useRequirementFiles";

export type RequirementType = "EPIC" | "FEATURE" | "STORY" | "ACCEPTANCE_CRITERIA";

export interface Requirement {
  id: string;
  code?: string;
  type: RequirementType;
  title: string;
  content?: string;
  children?: Requirement[];
  parentId?: string;
}

interface RequirementsTreeProps {
  requirements: Requirement[];
  projectId: string;
  shareToken?: string | null;
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

function RequirementNode({ requirement, level = 0, projectId, shareToken, onUpdate, onDelete, onAdd, onExpand, onLinkStandard }: any) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(requirement.title);
  const [editContent, setEditContent] = useState(requirement.content || "");
  const [isExpanding, setIsExpanding] = useState(false);
  const { fileCount, refresh: refreshFiles } = useRequirementFiles(requirement.id);
  const [openFileModal, setOpenFileModal] = useState(false);
  const Icon = typeIcons[requirement.type];
  const hasChildren = requirement.children?.length > 0;

  const handleAIExpand = async () => {
    if (requirement.type === "ACCEPTANCE_CRITERIA") return toast.error("Cannot expand further");
    setIsExpanding(true);
    try {
      const { data, error } = await supabase.functions.invoke("expand-requirement", { 
        body: { 
          requirementId: requirement.id,
          shareToken 
        } 
      });
      if (error) throw error;
      toast.success(`Added ${data.count} sub-requirements`);
      onExpand?.();
    } catch (error: any) {
      toast.error(error.message || "Expansion failed");
    } finally {
      setIsExpanding(false);
    }
  };

  const handleAddChild = () => {
    const nextType = getNextType(requirement.type);
    if (nextType && onAdd) {
      console.log("Adding child:", requirement.id, nextType);
      onAdd(requirement.id, nextType);
    }
  };

  return (
    <div className="select-none">
      {isEditing ? (
        <div className="p-3 md:p-4 bg-muted/30 rounded-md space-y-3 border" style={{ marginLeft: `${level * 20}px` }}>
          <div className="flex flex-wrap gap-2">
            {requirement.code && (
              <Badge variant="outline" className="font-mono text-xs">
                {requirement.code}
              </Badge>
            )}
            <Badge variant="outline" className={typeColors[requirement.type]}>
              {requirement.type.replace("_", " ")}
            </Badge>
          </div>
          <Input 
            value={editTitle} 
            onChange={(e) => setEditTitle(e.target.value)} 
            placeholder="Title"
            autoFocus 
            className="text-sm md:text-base"
          />
          <Textarea 
            value={editContent} 
            onChange={(e) => setEditContent(e.target.value)} 
            rows={4} 
            className="text-sm md:text-base"
          />
          <div className="flex flex-wrap gap-2">
            <Button 
               size="sm" 
               className="flex-1 min-w-[80px]"
               onClick={async () => { 
                 try {
                   await onUpdate?.(requirement.id, { title: editTitle, content: editContent });
                   toast.success("Changes saved");
                   setIsEditing(false);
                 } catch (error) {
                   console.error("Failed to save requirement", error);
                   toast.error("Failed to save changes");
                 }
               }}
             >
               Save
             </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1 min-w-[80px]"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="group py-2 px-2 rounded-md hover:bg-muted/50" style={{ paddingLeft: `${level * 20 + 8}px` }}>
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasChildren ? (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 p-0 flex-shrink-0" 
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
              ) : (
                <div className="h-6 w-6 flex-shrink-0" />
              )}
              <div className={`p-1 rounded flex-shrink-0 ${typeColors[requirement.type]}`}>
                <Icon className="h-3 w-3" />
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                {requirement.code && (
                  <Badge variant="outline" className="font-mono text-xs font-semibold flex-shrink-0">
                    {requirement.code}
                  </Badge>
                )}
                <Badge variant="outline" className={`text-xs flex-shrink-0 ${typeColors[requirement.type]}`}>
                  {requirement.type.replace("_", " ")}
                </Badge>
              </div>
              <div className="text-sm font-medium break-words">{requirement.title}</div>
              {requirement.content && (
                <p className="text-xs text-muted-foreground mt-1 break-words">{requirement.content}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RequirementStandardsBadges requirementId={requirement.id} />
                {fileCount > 0 && (
                  <Badge 
                    variant="secondary" 
                    className="text-xs gap-1 cursor-pointer hover:bg-secondary/80 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenFileModal(true);
                    }}
                  >
                    <Paperclip className="h-3 w-3" />
                    {fileCount} {fileCount === 1 ? "file" : "files"}
                  </Badge>
                )}
              </div>
            </div>
            
            {/* Action buttons - on mobile below, on desktop to the right with always visible */}
            <TooltipProvider>
              <div className="flex md:flex-row flex-wrap gap-1 mt-2 md:mt-0 md:ml-2 md:items-start md:flex-shrink-0 w-full md:w-auto pl-14 md:pl-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 flex-shrink-0" 
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit requirement</TooltipContent>
                </Tooltip>
                
                <SourceRequirementsUpload 
                  requirementId={requirement.id} 
                  requirementTitle={requirement.title} 
                  onUploadComplete={refreshFiles}
                  open={openFileModal}
                  onOpenChange={setOpenFileModal}
                />
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 flex-shrink-0" 
                      onClick={handleAIExpand} 
                      disabled={isExpanding}
                    >
                      {isExpanding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>AI expand</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 flex-shrink-0" 
                      onClick={() => onLinkStandard?.(requirement.id, requirement.title)}
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Link standards</TooltipContent>
                </Tooltip>
                
                {getNextType(requirement.type) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 flex-shrink-0" 
                        onClick={handleAddChild}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Add child requirement</TooltipContent>
                  </Tooltip>
                )}
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 flex-shrink-0 text-destructive hover:bg-destructive/10" 
                      onClick={() => onDelete?.(requirement.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete requirement</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </div>
      )}
      {isExpanded && hasChildren && <div>{requirement.children!.map((child: any) => <RequirementNode key={child.id} requirement={child} level={level + 1} projectId={projectId} shareToken={shareToken} onUpdate={onUpdate} onDelete={onDelete} onAdd={onAdd} onExpand={onExpand} onLinkStandard={onLinkStandard} />)}</div>}
    </div>
  );
}

export function RequirementsTree(props: RequirementsTreeProps) {
  return (
    <div className="space-y-1">
      {props.requirements.map((req) => (
        <RequirementNode 
          key={req.id} 
          requirement={req} 
          level={0}
          projectId={props.projectId}
          shareToken={props.shareToken}
          onUpdate={props.onNodeUpdate}
          onDelete={props.onNodeDelete}
          onAdd={props.onNodeAdd}
          onExpand={props.onExpand}
          onLinkStandard={props.onLinkStandard}
        />
      ))}
    </div>
  );
}
