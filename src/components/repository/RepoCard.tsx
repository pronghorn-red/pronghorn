import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Github, Trash2, Key } from "lucide-react";

interface RepoCardProps {
  repo: {
    id: string;
    organization: string;
    repo: string;
    branch: string;
    is_default: boolean;
  };
  onDelete?: (repoId: string) => void;
  onManagePAT?: (repoId: string) => void;
}

export function RepoCard({ repo, onDelete, onManagePAT }: RepoCardProps) {
  const fullName = `${repo.organization}/${repo.repo}`;

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
            {repo.is_default && (
              <Badge variant="secondary">Default</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
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
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(repo.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {repo.is_default ? 'Disconnect' : 'Remove'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
