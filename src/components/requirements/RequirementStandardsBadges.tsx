import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ListChecks } from "lucide-react";
import { useSearchParams } from "react-router-dom";

interface RequirementStandardsBadgesProps {
  requirementId: string;
}

export function RequirementStandardsBadges({ requirementId }: RequirementStandardsBadgesProps) {
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const [standards, setStandards] = useState<any[]>([]);

  useEffect(() => {
    loadStandards();

    // Set up real-time subscription for standard links
    const channel = supabase
      .channel(`requirement-standards-${requirementId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "requirement_standards",
          filter: `requirement_id=eq.${requirementId}`,
        },
        () => {
          loadStandards();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requirementId]);

  const loadStandards = async () => {
    try {
      const { data: reqStandards, error } = await supabase.rpc("get_requirement_standards_with_token", {
        p_requirement_id: requirementId,
        p_token: shareToken || null
      });

      if (error) throw error;

      // Now fetch the standards details for the linked standard_ids
      if (!reqStandards || reqStandards.length === 0) {
        setStandards([]);
        return;
      }

      const standardIds = reqStandards.map((rs: any) => rs.standard_id);
      const { data: standardsData, error: standardsError } = await supabase
        .from("standards")
        .select("id, code, title")
        .in("id", standardIds);

      if (standardsError) throw standardsError;

      setStandards(standardsData || []);
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
