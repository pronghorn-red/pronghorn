import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2 } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";

export function AdminAccessButton() {
  const { isAdmin, loading } = useAdmin();

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAdmin) {
    return (
      <Badge variant="default" className="gap-1">
        <ShieldCheck className="h-3 w-3" />
        Admin
      </Badge>
    );
  }

  // Non-admin users don't see anything
  return null;
}
