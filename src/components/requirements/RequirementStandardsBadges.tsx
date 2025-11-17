import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ListChecks } from "lucide-react";

interface RequirementStandardsBadgesProps {
  requirementId: string;
}

export function RequirementStandardsBadges({ requirementId }: RequirementStandardsBadgesProps) {
  const [standards, setStandards] = useState<any[]>([]);

  useEffect(() => {
    loadStandards();
  }, [requirementId]);

  const loadStandards = async () => {
    try {
      const { data, error } = await supabase
        .from("requirement_standards")
        .select(`
          standard_id,
          standards (
            id,
            code,
            title
          )
        `)
        .eq("requirement_id", requirementId);

      if (error) throw error;
      
      const standardsList = (data || [])
        .map((item: any) => item.standards)
        .filter(Boolean);
      
      setStandards(standardsList);
    } catch (error) {
      console.error("Error loading standards:", error);
    }
  };

  if (standards.length === 0) return null;

  return (
    <div className="flex gap-1 items-center flex-wrap">
      <ListChecks className="h-3 w-3 text-muted-foreground" />
      {standards.map((standard) => (
        <Badge
          key={standard.id}
          variant="secondary"
          className="text-xs font-mono"
        >
          {standard.code}
        </Badge>
      ))}
    </div>
  );
}
