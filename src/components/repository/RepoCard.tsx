import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Github, Trash2, Key, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface RepoCardProps {
  repo: {
    id: string;
    organization: string;
    repo: string;
    branch: string;
    is_default: boolean;
    is_prime?: boolean;
  };
  onDelete?: (repoId: string) => void;
  onManagePAT?: (repoId: string) => void;
  onPrimeChange?: () => void;
}

export function RepoCard({ repo, onDelete, onManagePAT, onPrimeChange }: RepoCardProps) {
  const fullName = `${repo.organization}/${repo.repo}`;
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const { toast } = useToast();

  const handleSetAsPrime = async () => {
    try {
      const { error } = await supabase.rpc("set_repo_prime_with_token", {
        p_repo_id: repo.id,
        p_token: shareToken || null,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `${fullName} is now the Prime repository`,
      });

      onPrimeChange?.();
    } catch (error: any) {
      console.error("Error setting prime repo:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to set Prime repository",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            <div>
              <CardTitle className="text-base">{fullName}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <GitBranch className="h-3 w-3" />
                {repo.branch}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            {repo.is_prime && (
              <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white">
                <Crown className="h-3 w-3 mr-1" />
                Prime
              </Badge>
            )}
            {repo.is_default && !repo.is_prime && (
              <Badge variant="secondary">Default</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 flex-wrap">
          {!repo.is_prime && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSetAsPrime}
            >
              <Crown className="h-4 w-4 mr-2" />
              Set as Prime
            </Button>
          )}
          {!repo.is_default && onManagePAT && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onManagePAT(repo.id)}
            >
              <Key className="h-4 w-4 mr-2" />
              Manage PAT
            </Button>
          )}
          {onDelete && !repo.is_prime && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(repo.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Disconnect
            </Button>
          )}
          {repo.is_prime && onDelete && (
            <p className="text-xs text-muted-foreground self-center ml-2">
              Prime repository cannot be disconnected
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
