import { useState, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { TechStackCard } from "@/components/techstack/TechStackCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, LogOut, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";
import { toast } from "sonner";

export default function TechStacks() {
  const { isAdmin, requestAdminAccess, logout } = useAdmin();
  const [searchQuery, setSearchQuery] = useState("");
  const [techStacks, setTechStacks] = useState<any[]>([]);
  const [newTechStackName, setNewTechStackName] = useState("");

  useEffect(() => {
    loadTechStacks();
  }, []);

  const loadTechStacks = async () => {
    // Only load top-level tech stacks (parent_id IS NULL)
    const { data } = await supabase
      .from("tech_stacks")
      .select("*")
      .is("parent_id", null)
      .order("name");
    setTechStacks(data || []);
  };

  const handleAddTechStack = async () => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required");
        return;
      }
    }
    
    if (!newTechStackName.trim()) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", user?.id).single();
    
    const { error } = await supabase.from("tech_stacks").insert({
      name: newTechStackName,
      org_id: profile?.org_id || null,
      created_by: user?.id,
    });
    
    if (error) {
      toast.error("Failed to create tech stack");
    } else {
      toast.success("Tech stack created");
      setNewTechStackName("");
      loadTechStacks();
    }
  };

  const handleDeleteTechStack = async (techStackId: string) => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required");
        return;
      }
    }

    if (!confirm("Delete this tech stack?")) return;

    const { error } = await supabase.from("tech_stacks").delete().eq("id", techStackId);

    if (error) {
      toast.error("Failed to delete tech stack");
    } else {
      toast.success("Tech stack deleted");
      loadTechStacks();
    }
  };

  const handleUpdateTechStack = async (techStackId: string, name: string, description: string) => {
    if (!isAdmin) {
      const granted = await requestAdminAccess();
      if (!granted) {
        toast.error("Admin access required");
        return;
      }
    }

    const { error } = await supabase
      .from("tech_stacks")
      .update({ name, description })
      .eq("id", techStackId);

    if (error) {
      toast.error("Failed to update tech stack");
    } else {
      toast.success("Tech stack updated");
      loadTechStacks();
    }
  };

  const filteredTechStacks = techStacks.filter((stack) =>
    stack.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (stack.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-2 md:gap-4">
              <h1 className="text-2xl md:text-3xl font-bold">Tech Stacks</h1>
              {isAdmin && <Badge variant="secondary">Admin Mode</Badge>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isAdmin && (
                <Button onClick={logout} variant="outline" size="sm">
                  <LogOut className="h-4 w-4 mr-2" />
                  Exit Admin Mode
                </Button>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tech stacks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm md:text-base"
              />
            </div>
          </div>

          {/* Add New Tech Stack (inline) */}
          {isAdmin && (
            <Card>
              <CardContent className="pt-4 md:pt-6 p-4 md:p-6">
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                  <Input
                    placeholder="New tech stack name..."
                    value={newTechStackName}
                    onChange={(e) => setNewTechStackName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTechStack()}
                    className="flex-1 text-sm md:text-base"
                  />
                  <Button onClick={handleAddTechStack} size="lg" className="w-full md:w-auto">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Tech Stack
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tech Stacks */}
          {filteredTechStacks.map((techStack) => (
            <TechStackCard
              key={techStack.id}
              techStack={techStack}
              onDelete={handleDeleteTechStack}
              onUpdate={handleUpdateTechStack}
              onRefresh={() => loadTechStacks()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
