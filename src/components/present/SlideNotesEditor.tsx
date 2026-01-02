import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StickyNote, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideNotesEditorProps {
  notes: string;
  onSave: (notes: string) => Promise<void>;
  className?: string;
}

export function SlideNotesEditor({ notes, onSave, className }: SlideNotesEditorProps) {
  const [localNotes, setLocalNotes] = useState(notes);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Sync with prop changes
  useEffect(() => {
    setLocalNotes(notes);
    setIsDirty(false);
  }, [notes]);

  const handleChange = (value: string) => {
    setLocalNotes(value);
    setIsDirty(value !== notes);
  };

  const handleSave = async () => {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      await onSave(localNotes);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className={cn("mt-4", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            Speaker Notes
          </CardTitle>
          {isDirty && (
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              Save
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Textarea
          value={localNotes}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Add speaker notes for this slide..."
          className="min-h-[100px] resize-none text-sm"
        />
      </CardContent>
    </Card>
  );
}
