import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Copy, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useShareToken } from "@/hooks/useShareToken";

export default function ProjectSettings() {
  const { projectId } = useParams<{ projectId: string }>();
  const shareToken = useShareToken(projectId);
  const queryClient = useQueryClient();

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const generateTokenMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .update({ share_token: crypto.randomUUID() })
        .eq('id', projectId)
        .select('share_token')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('New share token generated - previous links are now invalid');
    },
    onError: () => {
      toast.error('Failed to generate new token');
    },
  });

  const copyShareLink = () => {
    const token = project?.share_token;
    if (!token) {
      toast.error('No share token available');
      return;
    }
    
    const url = `https://pronghorn.red/project/${projectId}/requirements?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Share link copied to clipboard');
  };

  const copyFullUrl = () => {
    const token = project?.share_token;
    if (!token) {
      toast.error('No share token available');
      return;
    }
    
    const url = `https://pronghorn.red/project/${projectId}/settings?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Full URL copied to clipboard');
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} />

        <main className="flex-1 w-full">
          <div className="container px-6 py-8 max-w-4xl">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Project Settings</h2>
                <p className="text-muted-foreground">Configure your project settings and integrations</p>
              </div>

              <div className="space-y-6">
                {/* Share Token Management */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Share2 className="h-5 w-5" />
                      Share Token
                    </CardTitle>
                    <CardDescription>
                      Manage your project's sharing token. Anyone with this link can view and edit this project.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Current Token</Label>
                      <div className="flex gap-2">
                        <Input 
                          value={project?.share_token || 'Loading...'} 
                          readOnly 
                          className="font-mono text-sm"
                        />
                        <Button
                          onClick={copyFullUrl}
                          disabled={!project?.share_token}
                          className="shrink-0"
                        >
                          <Copy className="h-4 w-4" />
                          Copy Full URL
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 rounded-md bg-muted">
                      <RefreshCw className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Regenerating the token will invalidate all previous share links. Anyone using old links will lose access.
                        </p>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => generateTokenMutation.mutate()}
                          disabled={generateTokenMutation.isPending}
                        >
                          {generateTokenMutation.isPending ? 'Generating...' : 'Regenerate Token'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Project Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>Project Details</CardTitle>
                    <CardDescription>Basic information about your project</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Project Name</Label>
                      <Input id="name" defaultValue={project?.name} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Input id="description" defaultValue={project?.description || ''} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="repo">GitHub Repository</Label>
                      <Input id="repo" placeholder="owner/repo" defaultValue={project?.github_repo || ''} />
                    </div>

                    <Button>Save Changes</Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
