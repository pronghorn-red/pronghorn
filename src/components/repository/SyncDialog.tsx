import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repos: Array<{
    id: string;
    organization: string;
    repo: string;
    branch: string;
  }>;
  onConfirm: (config: SyncConfig) => void;
  type: "push" | "pull";
}

export interface SyncConfig {
  commitMessage: string;
  selectedRepos: string[];
  branches: { [repoId: string]: string };
}

export function SyncDialog({ open, onOpenChange, repos, onConfirm, type }: SyncDialogProps) {
  const [commitMessage, setCommitMessage] = useState(
    `${type === "push" ? "Push" : "Pull"} from Pronghorn at ${new Date().toLocaleString()}`
  );
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(
    new Set(repos.map(r => r.id))
  );
  const [branches, setBranches] = useState<{ [key: string]: string }>(
    repos.reduce((acc, repo) => ({ ...acc, [repo.id]: repo.branch }), {})
  );

  const handleConfirm = () => {
    onConfirm({
      commitMessage,
      selectedRepos: Array.from(selectedRepos),
      branches,
    });
    onOpenChange(false);
  };

  const toggleRepo = (repoId: string) => {
    const newSelected = new Set(selectedRepos);
    if (newSelected.has(repoId)) {
      newSelected.delete(repoId);
    } else {
      newSelected.add(repoId);
    }
    setSelectedRepos(newSelected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{type === "push" ? "Push to GitHub" : "Pull from GitHub"}</DialogTitle>
          <DialogDescription>
            {type === "push" 
              ? "Configure which repositories to push and the commit message" 
              : "Select which repositories to pull from and specify branches"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {type === "push" && (
            <div className="space-y-2">
              <Label htmlFor="commitMessage">Commit Message</Label>
              <Textarea
                id="commitMessage"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Enter commit message..."
                className="min-h-[80px]"
              />
            </div>
          )}

          <div className="space-y-3">
            <Label>Select Repositories</Label>
            {repos.map((repo) => (
              <div key={repo.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedRepos.has(repo.id)}
                    onCheckedChange={() => toggleRepo(repo.id)}
                  />
                  <div>
                    <p className="font-medium text-sm">{repo.organization}/{repo.repo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`branch-${repo.id}`} className="text-xs text-muted-foreground">
                    Branch:
                  </Label>
                  <Select
                    value={branches[repo.id] || repo.branch}
                    onValueChange={(value) => 
                      setBranches({ ...branches, [repo.id]: value })
                    }
                  >
                    <SelectTrigger className="w-[120px] h-8" id={`branch-${repo.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">main</SelectItem>
                      <SelectItem value="master">master</SelectItem>
                      <SelectItem value="develop">develop</SelectItem>
                      <SelectItem value="staging">staging</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={selectedRepos.size === 0}
          >
            {type === "push" ? "Push" : "Pull"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
