import { useState, useEffect, useCallback, useRef } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useShareToken } from "@/hooks/useShareToken";
import { TokenRecoveryMessage } from "@/components/project/TokenRecoveryMessage";

import { useAuth } from "@/contexts/AuthContext";
import { DeleteProjectDialog } from "@/components/dashboard/DeleteProjectDialog";
import { TokenManagement } from "@/components/project/TokenManagement";
import { AccessLevelBanner } from "@/components/project/AccessLevelBanner";

import { Switch } from "@/components/ui/switch";

export default function ProjectSettings() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet, tokenMissing } = useShareToken(projectId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [organization, setOrganization] = useState("");
  const [budget, setBudget] = useState("");
  const [scope, setScope] = useState("");
  const [timelineStart, setTimelineStart] = useState("");
  const [timelineEnd, setTimelineEnd] = useState("");
  const [priority, setPriority] = useState("medium");
  const [tags, setTags] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [maxTokens, setMaxTokens] = useState(32768);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingBudget, setThinkingBudget] = useState(-1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Broadcast refresh to other clients
  const broadcastRefresh = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "project_refresh",
        payload: { projectId },
      });
    }
  }, [projectId]);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      return data;
    },
    enabled: !!projectId && isTokenSet,
  });

  // Real-time subscription for project changes
  useEffect(() => {
    if (!projectId || !isTokenSet) return;

    const channel = supabase
      .channel(`project-settings-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects",
          filter: `id=eq.${projectId}`,
        },
        () => refetchProject()
      )
      .on("broadcast", { event: "project_refresh" }, () => refetchProject())
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, isTokenSet, refetchProject]);

  // Get user's role via authorize_project_access
  const { data: userRole } = useQuery({
    queryKey: ["project-role", projectId, shareToken],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("authorize_project_access", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      if (error) return null;
      return data as string | null;
    },
    enabled: !!projectId && isTokenSet,
  });

  const isOwner = userRole === "owner";

  // Fetch project tokens to auto-update URL with owner token
  const { data: tokens } = useQuery({
    queryKey: ["project-tokens", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_project_tokens_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      if (error) return [];
      return data as Array<{ id: string; token: string; role: string; label: string | null }>;
    },
    // Enable for authenticated users OR when token is ready
    enabled: !!projectId && isOwner && (!!user || isTokenSet),
  });

  // Auto-update URL with owner token if not present
  useEffect(() => {
    if (!tokens || tokens.length === 0 || shareToken) return;
    
    // Find "Default Owner Token" first, then any owner token
    const defaultOwnerToken = tokens.find(
      (t) => t.role === "owner" && t.label === "Default Owner Token"
    );
    const firstOwnerToken = tokens.find((t) => t.role === "owner");
    const ownerToken = defaultOwnerToken || firstOwnerToken;
    
    if (ownerToken) {
      navigate(`/project/${projectId}/settings/t/${ownerToken.token}`, { replace: true });
    }
  }, [tokens, shareToken, projectId, navigate]);

  useEffect(() => {
    if (project) {
      setProjectName(project.name || "");
      setProjectDescription(project.description || "");
      setOrganization(project.organization || "");
      setBudget(project.budget?.toString() || "");
      setScope(project.scope || "");
      setTimelineStart(project.timeline_start || "");
      setTimelineEnd(project.timeline_end || "");
      setPriority(project.priority || "medium");
      setTags(project.tags?.join(", ") || "");
      setSelectedModel(project.selected_model || "gemini-2.5-flash");
      setMaxTokens(project.max_tokens || 32768);
      setThinkingEnabled(project.thinking_enabled || false);
      setThinkingBudget(project.thinking_budget || -1);
    }
  }, [project]);

  const updateProjectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("update_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_name: projectName,
        p_description: projectDescription,
        p_organization: organization,
        p_budget: budget ? parseFloat(budget) : null,
        p_scope: scope,
        p_timeline_start: timelineStart || null,
        p_timeline_end: timelineEnd || null,
        p_priority: priority,
        p_tags: tags
          ? tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : null,
      });

      if (error) throw error;

      // Update LLM settings via RPC
      const { error: llmError } = await supabase.rpc("update_project_llm_settings_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_selected_model: selectedModel,
        p_max_tokens: maxTokens,
        p_thinking_enabled: thinkingEnabled,
        p_thinking_budget: thinkingBudget,
      });

      if (llmError) throw llmError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      broadcastRefresh();
      toast.success("Project details updated successfully");
    },
    onError: () => {
      toast.error("Failed to update project details");
    },
  });

  // Copy current URL for sharing
  const copyCurrentUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("URL copied to clipboard");
  };

  // Show token recovery message if token is missing
  if (tokenMissing) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <TokenRecoveryMessage />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
        <main className="flex-1 overflow-auto w-full">
          <div className="container px-4 md:px-6 py-6 md:py-8 max-w-6xl">
            <ProjectPageHeader
              title="Project Settings"
              subtitle="Configure your project settings and sharing options"
              onMenuClick={() => setIsSidebarOpen(true)}
            />
            <div className="space-y-6">
              {/* Show TokenManagement for owners, AccessLevelBanner for non-owners */}
                {isOwner ? (
                  <TokenManagement projectId={projectId!} shareToken={shareToken} />
                ) : (
                  <AccessLevelBanner projectId={projectId!} shareToken={shareToken} />
                )}

                {/* Project Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>Project Details</CardTitle>
                    <CardDescription>Basic information about your project</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Project Name</Label>
                      <Input id="name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Project Description</Label>
                      <Textarea
                        id="description"
                        value={projectDescription}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        placeholder="Enter detailed project description that can be used for AI context..."
                        rows={8}
                        className="resize-none"
                      />
                    </div>


                    <div className="space-y-2">
                      <Label htmlFor="organization">Organization</Label>
                      <Input
                        id="organization"
                        placeholder="Organization name"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="budget">Budget</Label>
                        <Input
                          id="budget"
                          type="number"
                          placeholder="0.00"
                          value={budget}
                          onChange={(e) => setBudget(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="priority">Priority</Label>
                        <Select value={priority} onValueChange={setPriority}>
                          <SelectTrigger id="priority">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="scope">Scope</Label>
                      <Textarea
                        id="scope"
                        placeholder="Define project scope and boundaries..."
                        value={scope}
                        onChange={(e) => setScope(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="timeline-start">Timeline Start</Label>
                        <Input
                          id="timeline-start"
                          type="date"
                          value={timelineStart}
                          onChange={(e) => setTimelineStart(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="timeline-end">Timeline End</Label>
                        <Input
                          id="timeline-end"
                          type="date"
                          value={timelineEnd}
                          onChange={(e) => setTimelineEnd(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tags">Tags</Label>
                      <Input
                        id="tags"
                        placeholder="tag1, tag2, tag3"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Comma-separated tags for project categorization</p>
                    </div>

                    <Button onClick={() => updateProjectMutation.mutate()} disabled={updateProjectMutation.isPending}>
                      {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </CardContent>
                </Card>

                {/* LLM Configuration */}
                <Card>
                  <CardHeader>
                    <CardTitle>LLM Configuration</CardTitle>
                    <CardDescription>Configure AI model settings for chat</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="model-select">Model</Label>
                      <Select value={selectedModel} onValueChange={setSelectedModel}>
                        <SelectTrigger id="model-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (Default)</SelectItem>
                          <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro (Advanced)</SelectItem>
                          <SelectItem value="gemini-3-pro-preview">Gemini 3 Pro Preview (Next-Gen)</SelectItem>
                          <SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Fast)</SelectItem>
                          <SelectItem value="claude-sonnet-4-5">Claude Sonnet 4.5</SelectItem>
                          <SelectItem value="claude-haiku-4-5">Claude Haiku 4.5</SelectItem>
                          <SelectItem value="claude-opus-4-5">Claude Opus 4.5</SelectItem>
                          <SelectItem value="grok-4-1-fast-reasoning">Grok 4.1 Fast Reasoning</SelectItem>
                          <SelectItem value="grok-4-1-fast-non-reasoning">Grok 4.1 Fast Non-Reasoning</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Flash: Fast and efficient • Pro: Enhanced reasoning • Lite: Fastest and cheapest
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max-tokens-select">Response Length</Label>
                      <Select value={maxTokens.toString()} onValueChange={(val) => setMaxTokens(Number(val))}>
                        <SelectTrigger id="max-tokens-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2048">Short (2,048 tokens)</SelectItem>
                          <SelectItem value="8192">Medium (8,192 tokens)</SelectItem>
                          <SelectItem value="16384">Large (16,384 tokens)</SelectItem>
                          <SelectItem value="32768">XL (32,768 tokens)</SelectItem>
                          {selectedModel === "claude-opus-4-1" ? (
                            <SelectItem value="32000">2XL (32,000 tokens)</SelectItem>
                          ) : selectedModel.startsWith("claude-") ? (
                            <SelectItem value="64000">2XL (64,000 tokens)</SelectItem>
                          ) : (
                            <SelectItem value="65535">2XL (65,535 tokens)</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Longer responses may take more time to generate</p>
                    </div>

                    {selectedModel === "gemini-2.5-flash" || selectedModel === "gemini-2.5-flash-lite" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="thinking-enabled">Thinking Enabled</Label>
                          <Switch
                            id="thinking-enabled"
                            checked={thinkingEnabled}
                            onCheckedChange={setThinkingEnabled}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Enable model thinking for complex reasoning</p>

                        {thinkingEnabled && (
                          <div className="space-y-2 mt-3">
                            <Label htmlFor="thinking-budget-select">Thinking Budget</Label>
                            <Select
                              value={thinkingBudget.toString()}
                              onValueChange={(val) => setThinkingBudget(Number(val))}
                            >
                              <SelectTrigger id="thinking-budget-select">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="-1">Fully Activated (Auto)</SelectItem>
                                {selectedModel === "gemini-2.5-flash" && (
                                  <>
                                    <SelectItem value="1024">Small (1,024 tokens)</SelectItem>
                                    <SelectItem value="4096">Medium (4,096 tokens)</SelectItem>
                                    <SelectItem value="8192">Large (8,192 tokens)</SelectItem>
                                    <SelectItem value="16384">XL (16,384 tokens)</SelectItem>
                                    <SelectItem value="24576">Max (24,576 tokens)</SelectItem>
                                  </>
                                )}
                                {selectedModel === "gemini-2.5-flash-lite" && (
                                  <>
                                    <SelectItem value="512">Minimum (512 tokens)</SelectItem>
                                    <SelectItem value="2048">Small (2,048 tokens)</SelectItem>
                                    <SelectItem value="4096">Medium (4,096 tokens)</SelectItem>
                                    <SelectItem value="8192">Large (8,192 tokens)</SelectItem>
                                    <SelectItem value="16384">XL (16,384 tokens)</SelectItem>
                                    <SelectItem value="24576">Max (24,576 tokens)</SelectItem>
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              {selectedModel === "gemini-2.5-flash" && "Range: 0-24,576 tokens"}
                              {selectedModel === "gemini-2.5-flash-lite" && "Range: 512-24,576 tokens"}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : null}

                    <Button onClick={() => updateProjectMutation.mutate()} disabled={updateProjectMutation.isPending}>
                      {updateProjectMutation.isPending ? "Saving..." : "Save LLM Settings"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Danger Zone - Project Deletion (owner role required) */}
                {isOwner && (
                  <Card className="border-destructive">
                    <CardHeader>
                      <CardTitle className="text-destructive">Danger Zone</CardTitle>
                      <CardDescription>
                        Irreversible actions that will permanently delete your project and all associated data.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-start gap-3 p-3 rounded-md bg-destructive/10">
                        <div className="flex-1 space-y-2">
                          <p className="text-sm text-muted-foreground">
                            Deleting this project will permanently remove all associated data including requirements, canvas nodes, standards, chat sessions, and artifacts. This action cannot be undone.
                          </p>
                          <DeleteProjectDialog
                            projectId={projectId!}
                            projectName={project?.name || "this project"}
                            shareToken={shareToken}
                            onDelete={() => {
                              toast.success("Project deleted successfully");
                              navigate("/dashboard");
                            }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
          </div>
        </main>
      </div>
    </div>
  );
}
