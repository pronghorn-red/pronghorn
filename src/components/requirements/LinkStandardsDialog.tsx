import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StandardsTree, Standard } from "@/components/standards/StandardsTree";
import { Loader2, Search } from "lucide-react";

interface LinkStandardsDialogProps {
  open: boolean;
  onClose: () => void;
  requirementId: string;
  requirementTitle: string;
}

export function LinkStandardsDialog({
  open,
  onClose,
  requirementId,
  requirementTitle
}: LinkStandardsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadStandards();
    }
  }, [open]);

  const loadStandards = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('standards')
        .select(`
          *,
          attachments:standard_attachments(*)
        `)
        .order('order_index');

      if (error) throw error;

      // Build hierarchical structure
      const rootStandards = data?.filter(s => !s.parent_id) || [];
      const buildTree = (parentId: string | null): Standard[] => {
        return data
          ?.filter(s => s.parent_id === parentId)
          .map(s => ({
            id: s.id,
            code: s.code,
            title: s.title,
            description: s.description || undefined,
            content: s.content || undefined,
            children: buildTree(s.id),
            attachments: s.attachments?.map((a: any) => ({
              id: a.id,
              type: a.type as any,
              name: a.name,
              url: a.url,
              description: a.description || undefined
            }))
          })) || [];
      };

      const tree = rootStandards.map(s => ({
        id: s.id,
        code: s.code,
        title: s.title,
        description: s.description || undefined,
        content: s.content || undefined,
        children: buildTree(s.id),
        attachments: s.attachments?.map((a: any) => ({
          id: a.id,
          type: a.type as any,
          name: a.name,
          url: a.url,
          description: a.description || undefined
        }))
      }));

      setStandards(tree);
    } catch (error) {
      console.error('Load standards error:', error);
      toast({
        title: "Failed to load standards",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLinkStandard = async (standard: Standard) => {
    try {
      const { error } = await supabase
        .from('requirement_standards')
        .insert({
          requirement_id: requirementId,
          standard_id: standard.id
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Already linked",
            description: "This standard is already linked to this requirement"
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: "Standard linked",
        description: `${standard.code} linked to requirement`
      });
    } catch (error) {
      console.error('Link error:', error);
      toast({
        title: "Failed to link standard",
        variant: "destructive"
      });
    }
  };

  const filteredStandards = searchQuery
    ? standards.filter(s =>
        s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : standards;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Link Standards to: {requirementTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search standards by code or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <StandardsTree
              standards={filteredStandards}
              onLinkStandard={handleLinkStandard}
              showLinkButton
            />
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
