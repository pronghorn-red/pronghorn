import { Clock, TrendingUp, Image as ImageIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { EditProjectDialog } from "./EditProjectDialog";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { CloneProjectDialog } from "./CloneProjectDialog";
import { useAdmin } from "@/contexts/AdminContext";
import { useAuth } from "@/contexts/AuthContext";

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
  splashImageUrl?: string | null;
  onClick?: (projectId: string) => void;
  onUpdate?: () => void;
  isAnonymous?: boolean;
  shareToken?: string;
  onSaveToAccount?: (projectId: string, shareToken: string) => void;
  variant?: "grid" | "list";
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
  splashImageUrl,
  onClick,
  onUpdate,
  isAnonymous,
  shareToken,
  onSaveToAccount,
  variant = "grid",
}: ProjectCardProps) {
  const statusInfo = statusConfig[status];
  const { isAdmin } = useAdmin();
  const { user } = useAuth();

  if (variant === "list") {
    return (
      <div
        className="flex gap-4 p-4 rounded-lg border bg-card hover:shadow-md transition-shadow group cursor-pointer"
        onClick={() => onClick?.(projectId)}
      >
        {/* Thumbnail */}
        <div className="w-24 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {splashImageUrl ? (
            <img
              src={splashImageUrl}
              alt={projectName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-base group-hover:text-primary transition-colors line-clamp-1">
              {projectName}
            </h3>
            <Badge variant="secondary" className={statusInfo.className}>
              {statusInfo.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Clock className="h-3 w-3" />
            Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
          </p>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {!isAnonymous && (
            <CloneProjectDialog
              projectId={projectId}
              projectName={projectName}
              shareToken={shareToken}
            />
          )}
          {!isAnonymous && (
            <EditProjectDialog
              projectId={projectId}
              currentName={projectName}
              currentDescription={description}
              currentOrganization={organization}
              currentBudget={budget}
              currentScope={scope}
              onUpdate={onUpdate}
            />
          )}
          {!isAnonymous && (isAdmin || user) && (
            <DeleteProjectDialog
              projectId={projectId}
              projectName={projectName}
              onDelete={onUpdate}
            />
          )}
          {isAnonymous && onSaveToAccount && shareToken && (
            <Button 
              variant="default" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSaveToAccount(projectId, shareToken);
              }}
            >
              Save to Account
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card 
      className="card-hover group relative overflow-hidden cursor-pointer"
      onClick={() => onClick?.(projectId)}
    >
      {/* Splash Image Banner */}
      {splashImageUrl && (
        <div className="h-32 w-full overflow-hidden">
          <img
            src={splashImageUrl}
            alt={projectName}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}
      <div 
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-background/80 backdrop-blur-sm rounded-md p-1"
        onClick={e => e.stopPropagation()}
      >
        {!isAnonymous && (
          <CloneProjectDialog
            projectId={projectId}
            projectName={projectName}
            shareToken={shareToken}
          />
        )}
        {!isAnonymous && (
          <EditProjectDialog
            projectId={projectId}
            currentName={projectName}
            currentDescription={description}
            currentOrganization={organization}
            currentBudget={budget}
            currentScope={scope}
            onUpdate={onUpdate}
          />
        )}
        {!isAnonymous && (isAdmin || user) && (
          <DeleteProjectDialog
            projectId={projectId}
            projectName={projectName}
            onDelete={onUpdate}
          />
        )}
      </div>
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
          {isAnonymous && onSaveToAccount && shareToken && (
            <Button 
              variant="default" 
              size="sm" 
              className="w-full mt-2"
              onClick={(e) => {
                e.stopPropagation();
                onSaveToAccount(projectId, shareToken);
              }}
            >
              Save to Account
            </Button>
        )}
      </CardContent>
    </Card>
  );
}
