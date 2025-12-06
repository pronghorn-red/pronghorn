import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Eye, Edit, Crown } from "lucide-react";

interface AccessLevelBannerProps {
  projectId: string;
  shareToken: string | null;
}

export function AccessLevelBanner({ projectId, shareToken }: AccessLevelBannerProps) {
  const { data: role, isLoading } = useQuery({
    queryKey: ["project-role", projectId, shareToken],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_project_role_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      if (error) throw error;
      return data as string | null;
    },
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <Card className="border-muted">
        <CardContent className="py-4">
          <div className="h-6 w-48 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!role) return null;

  const roleConfig = {
    owner: {
      label: "Owner",
      description: "Full access to all project settings and data",
      icon: Crown,
      variant: "default" as const,
      className: "bg-primary text-primary-foreground",
    },
    editor: {
      label: "Editor",
      description: "Can view and edit project content",
      icon: Edit,
      variant: "secondary" as const,
      className: "bg-secondary text-secondary-foreground",
    },
    viewer: {
      label: "Viewer",
      description: "Read-only access to project content",
      icon: Eye,
      variant: "outline" as const,
      className: "border-muted-foreground/30",
    },
  };

  const config = roleConfig[role as keyof typeof roleConfig] || roleConfig.viewer;
  const Icon = config.icon;

  return (
    <Card className="border-muted">
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Shield className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Your Access Level</span>
              <Badge variant={config.variant} className={config.className}>
                <Icon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
