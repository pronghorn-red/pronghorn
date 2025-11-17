import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export function CreateProjectDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }

    setIsCreating(true);

    try {
      // Get or create default organization
      let { data: orgs } = await supabase.from('organizations').select('id').limit(1);
      
      let orgId: string;
      if (!orgs || orgs.length === 0) {
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({ name: 'Default Organization' })
          .select('id')
          .single();
        
        if (orgError) throw orgError;
        orgId = newOrg.id;
      } else {
        orgId = orgs[0].id;
      }

      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          org_id: orgId,
          status: 'DESIGN'
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Project created successfully!");
      setOpen(false);
      setName("");
      setDescription("");
      setFile(null);
      
      // Navigate to the new project
      navigate(`/project/${project.id}/canvas`);
    } catch (error) {
      console.error("Error creating project:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create project");
    } finally {
      setIsCreating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Plus className="h-4 w-4" />
          Create New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Start a new project with optional requirements document upload
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input
              id="name"
              placeholder="Enterprise Portal"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of your project..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="file">Requirements Document (Optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file"
                type="file"
                accept=".txt,.md,.pdf,.doc,.docx"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              <Button variant="outline" size="icon" asChild>
                <label htmlFor="file" className="cursor-pointer">
                  <Upload className="h-4 w-4" />
                </label>
              </Button>
            </div>
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Upload a transcript or requirements document for AI decomposition
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Project"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
