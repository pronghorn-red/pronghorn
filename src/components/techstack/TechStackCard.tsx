import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TechStackTreeManager } from "./TechStackTreeManager";
import { DocsViewer } from "@/components/docs/DocsViewer";
import { Edit, Trash2, Check, X, BookOpen } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";

interface TechStackCardProps {
  techStack: any;
  onDelete: (techStackId: string) => void;
  onUpdate: (techStackId: string, name: string, description: string, longDescription?: string) => void;
  onRefresh: () => void;
}

export function TechStackCard({ techStack, onDelete, onUpdate, onRefresh }: TechStackCardProps) {
  const { isAdmin } = useAdmin();
  const [isEditing, setIsEditing] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [name, setName] = useState(techStack.name);
  const [description, setDescription] = useState(techStack.description || "");
  const [longDescription, setLongDescription] = useState(techStack.long_description || "");

  const handleSave = () => {
    onUpdate(techStack.id, name, description, longDescription);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(techStack.name);
    setDescription(techStack.description || "");
    setLongDescription(techStack.long_description || "");
    setIsEditing(false);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 md:p-6">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <Label>Tech Stack Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tech stack name"
                className="text-lg md:text-xl font-semibold"
              />
            </div>
            <div>
              <Label>Short Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
                rows={2}
                className="text-sm"
              />
            </div>
            <div>
              <Label>Long Description (KB Article / Documentation)</Label>
              <Textarea
                value={longDescription}
                onChange={(e) => setLongDescription(e.target.value)}
                placeholder="Paste in full documentation, KB articles, or detailed explanations here..."
                rows={6}
                className="text-sm font-mono"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={handleSave}>
                <Check className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                <X className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg md:text-xl truncate">{techStack.name}</CardTitle>
              <div className="flex gap-1 md:gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => setShowDocs(true)} className="gap-1">
                  <BookOpen className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="hidden md:inline">Docs</span>
                </Button>
                {isAdmin && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} className="h-7 w-7 md:h-8 md:w-8 p-0">
                      <Edit className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(techStack.id)} className="h-7 w-7 md:h-8 md:w-8 p-0">
                      <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {techStack.description && <CardDescription className="text-xs md:text-sm">{techStack.description}</CardDescription>}
          </>
        )}
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <TechStackTreeManager
          techStackId={techStack.id}
          onRefresh={onRefresh}
        />
      </CardContent>

      <DocsViewer
        open={showDocs}
        onClose={() => setShowDocs(false)}
        entityType="tech_stack"
        rootEntity={{
          id: techStack.id,
          name: techStack.name,
          description: techStack.description,
          long_description: techStack.long_description,
        }}
      />
    </Card>
  );
}
