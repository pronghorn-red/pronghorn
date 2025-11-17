import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, MoreVertical, FileText, ListTodo, CheckSquare, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type RequirementType = "EPIC" | "FEATURE" | "STORY" | "ACCEPTANCE_CRITERIA";

export interface Requirement {
  id: string;
  type: RequirementType;
  title: string;
  content?: string;
  children?: Requirement[];
  parentId?: string;
}

interface RequirementsTreeProps {
  requirements: Requirement[];
  onNodeSelect?: (id: string) => void;
  onNodeUpdate?: (id: string, updates: Partial<Requirement>) => void;
  onNodeDelete?: (id: string) => void;
  onNodeAdd?: (parentId: string | null, type: RequirementType) => void;
}

const typeIcons = {
  EPIC: FileText,
  FEATURE: ListTodo,
  STORY: CheckSquare,
  ACCEPTANCE_CRITERIA: FileCheck,
};

const typeColors = {
  EPIC: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  FEATURE: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  STORY: "bg-green-500/10 text-green-700 dark:text-green-400",
  ACCEPTANCE_CRITERIA: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
};

function RequirementNode({
  requirement,
  level = 0,
  onSelect,
  onUpdate,
  onDelete,
  onAdd,
}: {
  requirement: Requirement;
  level?: number;
  onSelect?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Requirement>) => void;
  onDelete?: (id: string) => void;
  onAdd?: (parentId: string | null, type: RequirementType) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(requirement.title);

  const Icon = typeIcons[requirement.type];
  const hasChildren = requirement.children && requirement.children.length > 0;

  const handleSave = () => {
    if (editValue.trim() && editValue !== requirement.title) {
      onUpdate?.(requirement.id, { title: editValue });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditValue(requirement.title);
      setIsEditing(false);
    }
  };

  return (
    <div className="select-none">
      <div
        className="group flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
        style={{ paddingLeft: `${level * 20 + 8}px` }}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        ) : (
          <div className="h-5 w-5" />
        )}

        <div className={`p-1 rounded ${typeColors[requirement.type]}`}>
          <Icon className="h-3 w-3" />
        </div>

        {isEditing ? (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="h-7 flex-1"
            autoFocus
          />
        ) : (
          <span
            className="flex-1 text-sm cursor-pointer"
            onClick={() => onSelect?.(requirement.id)}
            onDoubleClick={() => setIsEditing(true)}
          >
            {requirement.title}
          </span>
        )}

        <Badge variant="secondary" className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">
          {requirement.type}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              Edit
            </DropdownMenuItem>
            {requirement.type !== "ACCEPTANCE_CRITERIA" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    const nextType =
                      requirement.type === "EPIC"
                        ? "FEATURE"
                        : requirement.type === "FEATURE"
                        ? "STORY"
                        : "ACCEPTANCE_CRITERIA";
                    onAdd?.(requirement.id, nextType);
                  }}
                >
                  <Plus className="h-3 w-3 mr-2" />
                  Add Child
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete?.(requirement.id)}
              className="text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {requirement.children!.map((child) => (
            <RequirementNode
              key={child.id}
              requirement={child}
              level={level + 1}
              onSelect={onSelect}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAdd={onAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function RequirementsTree({
  requirements,
  onNodeSelect,
  onNodeUpdate,
  onNodeDelete,
  onNodeAdd,
}: RequirementsTreeProps) {
  return (
    <div className="space-y-1">
      {requirements.map((requirement) => (
        <RequirementNode
          key={requirement.id}
          requirement={requirement}
          onSelect={onNodeSelect}
          onUpdate={onNodeUpdate}
          onDelete={onNodeDelete}
          onAdd={onNodeAdd}
        />
      ))}
    </div>
  );
}
