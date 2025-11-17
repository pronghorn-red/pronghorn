import { Clock, TrendingUp, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { EditProjectDialog } from "./EditProjectDialog";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { useAdmin } from "@/contexts/AdminContext";

interface ProjectCardProps {
  projectId: string;
  projectName: string;
  lastUpdated: Date;
  status: "DESIGN" | "AUDIT" | "BUILD";
  coverage?: number;
  description?: string | null;
  organization?: string | null;
  budget?: number | null;
  scope?: string | null;
  onClick?: (projectId: string) => void;
  onUpdate?: () => void;
}

const statusConfig = {
  DESIGN: {
    label: "Design",
    className: "bg-status-design/10 text-status-design hover:bg-status-design/20",
  },
  AUDIT: {
    label: "Audit",
    className: "bg-status-audit/10 text-status-audit hover:bg-status-audit/20",
  },
  BUILD: {
    label: "Build",
    className: "bg-status-build/10 text-status-build hover:bg-status-build/20",
  },
};

export function ProjectCard({
  projectId,
  projectName,
  lastUpdated,
  status,
  coverage,
  description,
  organization,
  budget,
  scope,
  onClick,
  onUpdate,
}: ProjectCardProps) {
  const statusInfo = statusConfig[status];
  const { isAdmin } = useAdmin();

  return (
    <Card
      className="card-hover group relative"
    >
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-background/80 backdrop-blur-sm rounded-md p-1">
        <EditProjectDialog
          projectId={projectId}
          currentName={projectName}
          currentDescription={description}
          currentOrganization={organization}
          currentBudget={budget}
          currentScope={scope}
          onUpdate={onUpdate}
        />
        {isAdmin && (
          <DeleteProjectDialog
            projectId={projectId}
            projectName={projectName}
            onDelete={onUpdate}
          />
        )}
      </div>
      <div 
        className="cursor-pointer"
        onClick={() => onClick?.(projectId)}
      >
        <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg group-hover:text-primary transition-colors">
            {projectName}
          </CardTitle>
          <Badge variant="secondary" className={statusInfo.className}>
            {statusInfo.label}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {coverage !== undefined && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Coverage
              </span>
              <span className="font-semibold">{coverage}%</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                style={{ width: `${coverage}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
      </div>
    </Card>
  );
}
