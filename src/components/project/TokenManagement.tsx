import { useState } from "react";
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
import { Key, Plus, Copy, Trash2, Eye, EyeOff } from "lucide-react";
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
  const [newTokenRole, setNewTokenRole] = useState<"editor" | "viewer">("editor");
  const [newTokenExpiry, setNewTokenExpiry] = useState("");
  const [visibleTokens, setVisibleTokens] = useState<Set<string>>(new Set());

  const { data: tokens, isLoading, error } = useQuery({
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

  // If error contains "Access denied" or similar, user isn't owner - hide component
  if (error && (error.message?.includes("Access denied") || error.message?.includes("owner"))) {
    return null;
  }

  return (
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
                  <Select value={newTokenRole} onValueChange={(v) => setNewTokenRole(v as "editor" | "viewer")}>
                    <SelectTrigger id="token-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor - Can view and edit</SelectItem>
                      <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Owner tokens cannot be created - only the project creator has owner access.
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
  );
}
