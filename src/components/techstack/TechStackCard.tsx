import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TechStackTreeManager } from "./TechStackTreeManager";
import { Edit, Trash2, Check, X } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";

interface TechStackCardProps {
  techStack: any;
  onDelete: (techStackId: string) => void;
  onUpdate: (techStackId: string, name: string, description: string) => void;
  onRefresh: () => void;
}

export function TechStackCard({ techStack, onDelete, onUpdate, onRefresh }: TechStackCardProps) {
  const { isAdmin } = useAdmin();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(techStack.name);
  const [description, setDescription] = useState(techStack.description || "");

  const handleSave = () => {
    onUpdate(techStack.id, name, description);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(techStack.name);
    setDescription(techStack.description || "");
    setIsEditing(false);
  };

  return (
    <Card>
      <CardHeader>
        {isEditing ? (
          <div className="space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tech stack name"
              className="text-xl font-semibold"
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tech stack description"
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>
                <Check className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <CardTitle>{techStack.name}</CardTitle>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(techStack.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {techStack.description && <CardDescription>{techStack.description}</CardDescription>}
          </>
        )}
      </CardHeader>
      <CardContent>
        <TechStackTreeManager
          techStackId={techStack.id}
          onRefresh={onRefresh}
        />
      </CardContent>
    </Card>
  );
}
