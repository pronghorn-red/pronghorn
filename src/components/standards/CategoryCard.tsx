import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StandardsTreeManager } from "./StandardsTreeManager";
import { DocsViewer } from "@/components/docs/DocsViewer";
import { Standard } from "./StandardsTree";
import { Edit, Trash2, Check, X, BookOpen } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";

interface CategoryCardProps {
  category: any;
  standards: Standard[];
  onDelete: (categoryId: string) => void;
  onUpdate: (categoryId: string, name: string, description: string) => void;
  onRefresh: () => void;
}

export function CategoryCard({ category, standards, onDelete, onUpdate, onRefresh }: CategoryCardProps) {
  const { isAdmin } = useAdmin();
  const [isEditing, setIsEditing] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description || "");

  const handleSave = () => {
    onUpdate(category.id, name, description);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(category.name);
    setDescription(category.description || "");
    setIsEditing(false);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 md:p-6">
        {isEditing ? (
          <div className="space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category name"
              className="text-lg md:text-xl font-semibold"
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Category description"
              rows={2}
              className="text-sm"
            />
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
              <CardTitle className="text-lg md:text-xl truncate">{category.name}</CardTitle>
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
                    <Button size="sm" variant="ghost" onClick={() => onDelete(category.id)} className="h-7 w-7 md:h-8 md:w-8 p-0">
                      <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {category.description && <CardDescription className="text-xs md:text-sm">{category.description}</CardDescription>}
          </>
        )}
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <StandardsTreeManager
          standards={standards}
          categoryId={category.id}
          onRefresh={onRefresh}
        />
      </CardContent>

      <DocsViewer
        open={showDocs}
        onClose={() => setShowDocs(false)}
        entityType="standard_category"
        rootEntity={{
          id: category.id,
          name: category.name,
          description: category.description,
          long_description: category.long_description,
        }}
      />
    </Card>
  );
}
