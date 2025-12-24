import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { StandardsTreeManager } from "./StandardsTreeManager";
import { DocsViewer } from "@/components/docs/DocsViewer";
import { Standard } from "./StandardsTree";
import { Edit, Trash2, Check, X, BookOpen } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";

interface CategoryCardProps {
  category: any;
  standards: Standard[];
  onDelete: (categoryId: string) => void;
  onUpdate: (categoryId: string, name: string, description: string, longDescription?: string) => void;
  onRefresh: () => void;
}

export function CategoryCard({ category, standards, onDelete, onUpdate, onRefresh }: CategoryCardProps) {
  const { isAdmin } = useAdmin();
  const [isEditing, setIsEditing] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description || "");
  const [longDescription, setLongDescription] = useState(category.long_description || "");

  const handleSave = () => {
    onUpdate(category.id, name, description, longDescription);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(category.name);
    setDescription(category.description || "");
    setLongDescription(category.long_description || "");
    setIsEditing(false);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 md:p-6">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <Label>Category Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Category name"
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

      <Accordion type="single" collapsible className="px-4 md:px-6 pb-4 md:pb-6">
        <AccordionItem value="standards" className="border-none">
          <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:no-underline">
            {standards.length} standard{standards.length !== 1 ? 's' : ''}
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <StandardsTreeManager
              standards={standards}
              categoryId={category.id}
              onRefresh={onRefresh}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

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
