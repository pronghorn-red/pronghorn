import { useState, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Copy, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useShareToken } from "@/hooks/useShareToken";
import { useAuth } from "@/contexts/AuthContext";

import { Switch } from "@/components/ui/switch";

export default function ProjectSettings() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
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

  const { data: project } = useQuery({
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

  useEffect(() => {
    if (project) {
      setProjectName(project.name || "");
      setProjectDescription(project.description || "");
      setGithubRepo(project.github_repo || "");
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
        p_github_repo: githubRepo,
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
      toast.success("Project details updated successfully");
    },
    onError: () => {
      toast.error("Failed to update project details");
    },
  });

  const generateTokenMutation = useMutation({
    mutationFn: async () => {
      // CRITICAL: Use token-based RPC for token regeneration
      const { data: newToken, error } = await supabase.rpc("regenerate_share_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      return { share_token: newToken };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("New share token generated - previous links are now invalid");
    },
    onError: () => {
      toast.error("Failed to generate new token");
    },
  });

  const copyShareLink = () => {
    const token = project?.share_token;
    if (!token) {
      toast.error("No share token available");
      return;
    }

    const url = `https://pronghorn.red/project/${projectId}/requirements?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied to clipboard");
  };

  const copyFullUrl = () => {
    const token = project?.share_token;
    if (!token) {
      toast.error("No share token available");
      return;
    }

    const url = `https://pronghorn.red/project/${projectId}/settings?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Full URL copied to clipboard");
  };

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
                        <Input value={project?.share_token || "Loading..."} readOnly className="font-mono text-sm" />
                        <Button onClick={copyFullUrl} disabled={!project?.share_token} className="shrink-0">
                          <Copy className="h-4 w-4" />
                          Copy Full URL
                        </Button>
                      </div>
                    </div>

                    {user && project?.created_by === user.id && (
                      <div className="flex items-start gap-3 p-3 rounded-md bg-muted">
                        <RefreshCw className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div className="flex-1 space-y-2">
                          <p className="text-sm text-muted-foreground">
                            Regenerating the token will invalidate all previous share links. Anyone using old links will
                            lose access.
                          </p>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => generateTokenMutation.mutate()}
                            disabled={generateTokenMutation.isPending}
                          >
                            {generateTokenMutation.isPending ? "Generating..." : "Regenerate Token"}
                          </Button>
                        </div>
                      </div>
                    )}
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
                      <Label htmlFor="repo">GitHub Repository</Label>
                      <Input
                        id="repo"
                        placeholder="owner/repo"
                        value={githubRepo}
                        onChange={(e) => setGithubRepo(e.target.value)}
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
                          <SelectItem value="claude-opus-4-1">Claude Opus 4.1</SelectItem>
                          <SelectItem value="grok-4-fast-reasoning">Grok 4 Fast Reasoning</SelectItem>
                          <SelectItem value="grok-4-fast-non-reasoning">Grok 4 Fast Non-Reasoning</SelectItem>
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
              </div>
          </div>
        </main>
      </div>
    </div>
  );
}
