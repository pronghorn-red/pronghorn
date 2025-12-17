import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Key, Plus, Copy, Trash2, Eye, EyeOff, Link2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface TokenManagementProps {
  projectId: string;
  shareToken: string | null;
}

interface ProjectToken {
  id: string;
  project_id: string;
  token: string;
  role: "owner" | "editor" | "viewer";
  label: string | null;
  created_at: string;
  created_by: string | null;
  expires_at: string | null;
  last_used_at: string | null;
}

export function TokenManagement({ projectId, shareToken }: TokenManagementProps) {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [newTokenRole, setNewTokenRole] = useState<"owner" | "editor" | "viewer">("editor");
  const [newTokenExpiry, setNewTokenExpiry] = useState("");
  const [visibleTokens, setVisibleTokens] = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Broadcast refresh to other clients
  const broadcastRefresh = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "tokens_refresh",
        payload: { projectId },
      });
    }
  }, [projectId]);

  const { data: tokens, isLoading, error, refetch } = useQuery({
    queryKey: ["project-tokens", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_project_tokens_with_token" as any, {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      return data as ProjectToken[];
    },
    enabled: !!projectId,
  });

  // Real-time subscription for tokens
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`tokens-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_tokens",
          filter: `project_id=eq.${projectId}`,
        },
        () => refetch()
      )
      .on("broadcast", { event: "tokens_refresh" }, () => refetch())
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, refetch]);

  const createTokenMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_project_token_with_token" as any, {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_role: newTokenRole,
        p_label: newTokenLabel || null,
        p_expires_at: newTokenExpiry ? new Date(newTokenExpiry).toISOString() : null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-tokens", projectId] });
      broadcastRefresh();
      toast.success("Access token created");
      setIsCreateDialogOpen(false);
      setNewTokenLabel("");
      setNewTokenRole("editor");
      setNewTokenExpiry("");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create token: ${error.message}`);
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const { error } = await supabase.rpc("delete_project_token_with_token" as any, {
        p_token_id: tokenId,
        p_token: shareToken || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-tokens", projectId] });
      broadcastRefresh();
      toast.success("Token deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete token: ${error.message}`);
    },
  });

  const copyTokenUrl = (token: string) => {
    const url = `https://pronghorn.red/project/${projectId}/requirements/t/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Token URL copied to clipboard");
  };

  const toggleTokenVisibility = (tokenId: string) => {
    setVisibleTokens((prev) => {
      const next = new Set(prev);
      if (next.has(tokenId)) {
        next.delete(tokenId);
      } else {
        next.add(tokenId);
      }
      return next;
    });
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "editor":
        return "secondary";
      case "viewer":
        return "outline";
      default:
        return "outline";
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return "Invalid date";
    }
  };

  const [showMyToken, setShowMyToken] = useState(false);

  const copyCurrentAccessUrl = () => {
    if (!shareToken) {
      toast.error("No access token available");
      return;
    }
    const url = `https://pronghorn.red/project/${projectId}/settings/t/${shareToken}`;
    navigator.clipboard.writeText(url);
    toast.success("Access URL copied to clipboard");
  };

  // If error contains "Access denied" or similar, user isn't owner - hide component
  if (error && (error.message?.includes("Access denied") || error.message?.includes("owner"))) {
    return null;
  }

  return (
    <>
      {/* Your Current Access URL Card */}
      {shareToken && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Your Access URL
            </CardTitle>
            <CardDescription>
              This is your personal access URL. The token is hidden in the browser for security but you can copy the full URL here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input 
                readOnly 
                value={showMyToken 
                  ? `https://pronghorn.red/project/${projectId}/settings/t/${shareToken}`
                  : `https://pronghorn.red/project/${projectId}/settings/t/••••••••••••`
                }
                className="font-mono text-xs"
              />
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setShowMyToken(!showMyToken)}
                title={showMyToken ? "Hide token" : "Show token"}
              >
                {showMyToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={copyCurrentAccessUrl}
                title="Copy full URL"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Bookmark this URL or share it to regain access from another browser session.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Access Tokens
            </CardTitle>
            <CardDescription>
              Create and manage access tokens to share your project with different permission levels.
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Token
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Access Token</DialogTitle>
                <DialogDescription>
                  Create a new token to share project access with others.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="token-label">Label (optional)</Label>
                  <Input
                    id="token-label"
                    placeholder="e.g., QA Team, Client Access"
                    value={newTokenLabel}
                    onChange={(e) => setNewTokenLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token-role">Role</Label>
                  <Select value={newTokenRole} onValueChange={(v) => setNewTokenRole(v as "owner" | "editor" | "viewer")}>
                    <SelectTrigger id="token-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner - Full access including token management</SelectItem>
                      <SelectItem value="editor">Editor - Can view and edit project content</SelectItem>
                      <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Owners can create and manage tokens. Editors can modify content. Viewers have read-only access.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token-expiry">Expires (optional)</Label>
                  <Input
                    id="token-expiry"
                    type="datetime-local"
                    value={newTokenExpiry}
                    onChange={(e) => setNewTokenExpiry(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty for a token that never expires.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => createTokenMutation.mutate()} disabled={createTokenMutation.isPending}>
                  {createTokenMutation.isPending ? "Creating..." : "Create Token"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">Loading tokens...</div>
        ) : tokens && tokens.length > 0 ? (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">
                      {token.label || <span className="text-muted-foreground italic">Unnamed</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(token.role)}>
                        {token.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1">
                        <span className="max-w-[120px] truncate">
                          {visibleTokens.has(token.id) ? token.token : "••••••••••••"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleTokenVisibility(token.id)}
                        >
                          {visibleTokens.has(token.id) ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(token.last_used_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {token.expires_at ? formatDate(token.expires_at) : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => copyTokenUrl(token.token)}
                          title="Copy URL"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteTokenMutation.mutate(token.id)}
                          disabled={deleteTokenMutation.isPending}
                          title="Delete token"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No access tokens created yet.</p>
            <p className="text-sm">Create a token to share project access with specific permissions.</p>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}
