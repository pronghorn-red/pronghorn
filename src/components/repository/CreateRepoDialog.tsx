import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Plus } from "lucide-react";

interface CreateRepoDialogProps {
  onCreateEmpty: (name: string, isPrivate: boolean) => void;
  onCreateFromTemplate: (name: string, templateOrg: string, templateRepo: string, isPrivate: boolean) => void;
  onClonePublic: (name: string, sourceOrg: string, sourceRepo: string, sourceBranch: string, isPrivate: boolean) => void;
  onLinkExisting: (org: string, repo: string, branch: string, pat?: string) => void;
}

export function CreateRepoDialog({
  onCreateEmpty,
  onCreateFromTemplate,
  onClonePublic,
  onLinkExisting,
}: CreateRepoDialogProps) {
  const [open, setOpen] = useState(false);
  const [emptyName, setEmptyName] = useState("");
  const [emptyPrivate, setEmptyPrivate] = useState(true);
  const [templateName, setTemplateName] = useState("");
  const [templateOrg, setTemplateOrg] = useState("pronghorn-red");
  const [templateRepo, setTemplateRepo] = useState("");
  const [templatePrivate, setTemplatePrivate] = useState(true);
  const [cloneName, setCloneName] = useState("");
  const [cloneOrg, setCloneOrg] = useState("");
  const [cloneRepo, setCloneRepo] = useState("");
  const [cloneBranch, setCloneBranch] = useState("main");
  const [clonePrivate, setClonePrivate] = useState(true);
  const [linkOrg, setLinkOrg] = useState("");
  const [linkRepo, setLinkRepo] = useState("");
  const [linkBranch, setLinkBranch] = useState("main");
  const [linkPat, setLinkPat] = useState("");

  const handleCreateEmpty = () => {
    if (emptyName.trim()) {
      onCreateEmpty(emptyName, emptyPrivate);
      setOpen(false);
      setEmptyName("");
      setEmptyPrivate(true);
    }
  };

  const handleCreateFromTemplate = () => {
    if (templateName.trim() && templateOrg.trim() && templateRepo.trim()) {
      onCreateFromTemplate(templateName, templateOrg, templateRepo, templatePrivate);
      setOpen(false);
      setTemplateName("");
      setTemplateOrg("pronghorn-red");
      setTemplateRepo("");
      setTemplatePrivate(true);
    }
  };

  const handleClonePublic = () => {
    if (cloneName.trim() && cloneOrg.trim() && cloneRepo.trim()) {
      onClonePublic(cloneName, cloneOrg, cloneRepo, cloneBranch, clonePrivate);
      setOpen(false);
      setCloneName("");
      setCloneOrg("");
      setCloneRepo("");
      setCloneBranch("main");
      setClonePrivate(true);
    }
  };

  const handleLinkExisting = () => {
    if (linkOrg.trim() && linkRepo.trim()) {
      onLinkExisting(linkOrg, linkRepo, linkBranch, linkPat || undefined);
      setOpen(false);
      setLinkOrg("");
      setLinkRepo("");
      setLinkBranch("main");
      setLinkPat("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Repository
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Repository</DialogTitle>
          <DialogDescription>
            Create a new repository or link an existing one
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="empty">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="empty">Create Empty</TabsTrigger>
            <TabsTrigger value="template">From Template</TabsTrigger>
            <TabsTrigger value="clone">Clone Public</TabsTrigger>
            <TabsTrigger value="link">Link Existing</TabsTrigger>
          </TabsList>

          <TabsContent value="empty" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="empty-name">Repository Name</Label>
              <Input
                id="empty-name"
                placeholder="my-new-project"
                value={emptyName}
                onChange={(e) => setEmptyName(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Will be created in pronghorn-red organization
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label>Private repository</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, the GitHub repository will be private.
                </p>
              </div>
              <Switch
                checked={emptyPrivate}
                onCheckedChange={setEmptyPrivate}
                aria-label="Toggle private repository"
              />
            </div>
            <Button onClick={handleCreateEmpty} className="w-full">
              Create Empty Repository
            </Button>
          </TabsContent>

          <TabsContent value="template" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-org">Template Organization</Label>
              <Input
                id="template-org"
                placeholder="pronghorn-red"
                value={templateOrg}
                onChange={(e) => setTemplateOrg(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-repo">Template Repository</Label>
              <Input
                id="template-repo"
                placeholder="react-template"
                value={templateRepo}
                onChange={(e) => setTemplateRepo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-name">New Repository Name</Label>
              <Input
                id="template-name"
                placeholder="my-project"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label>Private repository</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, the GitHub repository will be private.
                </p>
              </div>
              <Switch
                checked={templatePrivate}
                onCheckedChange={setTemplatePrivate}
                aria-label="Toggle private repository"
              />
            </div>
            <Button onClick={handleCreateFromTemplate} className="w-full">
              Create from Template
            </Button>
          </TabsContent>

          <TabsContent value="clone" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clone-org">Source Organization/Owner</Label>
              <Input
                id="clone-org"
                placeholder="developmentation"
                value={cloneOrg}
                onChange={(e) => setCloneOrg(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clone-repo">Source Repository</Label>
              <Input
                id="clone-repo"
                placeholder="ai-starter-template"
                value={cloneRepo}
                onChange={(e) => setCloneRepo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clone-branch">Source Branch</Label>
              <Input
                id="clone-branch"
                placeholder="main"
                value={cloneBranch}
                onChange={(e) => setCloneBranch(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clone-name">New Repository Name</Label>
              <Input
                id="clone-name"
                placeholder="my-project"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label>Private repository</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, the GitHub repository will be private.
                </p>
              </div>
              <Switch
                checked={clonePrivate}
                onCheckedChange={setClonePrivate}
                aria-label="Toggle private repository"
              />
            </div>
            <Button onClick={handleClonePublic} className="w-full">
              Clone Public Repository
            </Button>
          </TabsContent>

          <TabsContent value="link" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="link-org">Organization/Owner</Label>
              <Input
                id="link-org"
                placeholder="your-username"
                value={linkOrg}
                onChange={(e) => setLinkOrg(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-repo">Repository Name</Label>
              <Input
                id="link-repo"
                placeholder="existing-repo"
                value={linkRepo}
                onChange={(e) => setLinkRepo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-branch">Branch</Label>
              <Input
                id="link-branch"
                placeholder="main"
                value={linkBranch}
                onChange={(e) => setLinkBranch(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-pat">Personal Access Token (Optional)</Label>
              <Input
                id="link-pat"
                type="password"
                placeholder="ghp_xxxxxxxxxxxx"
                value={linkPat}
                onChange={(e) => setLinkPat(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Required for private repositories. Token will be encrypted.
              </p>
            </div>
            <Button onClick={handleLinkExisting} className="w-full">
              Link Repository
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
