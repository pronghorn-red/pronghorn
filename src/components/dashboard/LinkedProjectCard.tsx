import { Clock, AlertTriangle, Trash2, Image as ImageIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LinkedProjectCardProps {
  projectId: string;
  projectName: string;
  projectStatus: "DESIGN" | "AUDIT" | "BUILD";
  projectUpdatedAt: Date;
  projectDescription?: string | null;
  projectSplashImageUrl?: string | null;
  role: "owner" | "editor" | "viewer";
  isValid: boolean;
  token: string;
  onClick?: (projectId: string, token: string) => void;
  onUnlink?: () => void;
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

const roleConfig = {
  owner: {
    label: "Owner",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  editor: {
    label: "Editor",
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  viewer: {
    label: "Viewer",
    className: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  },
};

export function LinkedProjectCard({
  projectId,
  projectName,
  projectStatus,
  projectUpdatedAt,
  projectDescription,
  projectSplashImageUrl,
  role,
  isValid,
  token,
  onClick,
  onUnlink,
  variant = "grid",
}: LinkedProjectCardProps) {
  const statusInfo = statusConfig[projectStatus];
  const roleInfo = roleConfig[role];

  const handleUnlink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.rpc('unlink_shared_project', {
        p_project_id: projectId
      });
      if (error) throw error;
      toast.success("Project removed from dashboard");
      onUnlink?.();
    } catch (error) {
      console.error("Error unlinking project:", error);
      toast.error("Failed to remove project");
    }
  };

  if (variant === "list") {
    return (
      <div
        className={`flex gap-4 p-4 rounded-lg border bg-card hover:shadow-md transition-shadow group ${!isValid ? 'opacity-60 border-destructive/50' : 'cursor-pointer'}`}
        onClick={() => isValid && onClick?.(projectId, token)}
      >
        {/* Thumbnail */}
        <div className="w-24 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {projectSplashImageUrl ? (
            <img
              src={projectSplashImageUrl}
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
            <div className="flex gap-1 flex-shrink-0">
              <Badge variant="outline" className={roleInfo.className}>
                {roleInfo.label}
              </Badge>
              {isValid ? (
                <Badge variant="secondary" className={statusInfo.className}>
                  {statusInfo.label}
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Revoked
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Clock className="h-3 w-3" />
            Updated {formatDistanceToNow(projectUpdatedAt, { addSuffix: true })}
          </p>
          {projectDescription && isValid && (
            <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{projectDescription}</p>
          )}
          {!isValid && (
            <p className="text-xs text-destructive mt-1">
              Your access to this project has been revoked.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={handleUnlink}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card
      className={`card-hover group relative ${!isValid ? 'opacity-60 border-destructive/50' : ''}`}
    >
      {/* Splash Image Banner */}
      {projectSplashImageUrl && (
        <div className="h-32 w-full overflow-hidden">
          <img
            src={projectSplashImageUrl}
            alt={projectName}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-background/80 backdrop-blur-sm rounded-md p-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={handleUnlink}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      
      <div 
        className={`${isValid ? 'cursor-pointer' : 'cursor-not-allowed'}`}
        onClick={() => isValid && onClick?.(projectId, token)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg group-hover:text-primary transition-colors line-clamp-1">
              {projectName}
            </CardTitle>
            <div className="flex gap-1 flex-shrink-0">
              <Badge variant="outline" className={roleInfo.className}>
                {roleInfo.label}
              </Badge>
              {isValid ? (
                <Badge variant="secondary" className={statusInfo.className}>
                  {statusInfo.label}
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Revoked
                </Badge>
              )}
            </div>
          </div>
          <CardDescription className="flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3" />
            Updated {formatDistanceToNow(projectUpdatedAt, { addSuffix: true })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projectDescription && isValid && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{projectDescription}</p>
          )}
          {!isValid && (
            <p className="text-xs text-destructive">
              Your access to this project has been revoked. Contact the owner for a new share link.
            </p>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
