import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, LogOut, Loader2 } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";
import { toast } from "sonner";

export function AdminAccessButton() {
  const { isAdmin, isLoading, user, requestAdminAccess, logout } = useAdmin();
  const [showDialog, setShowDialog] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!user) {
      toast.error("You must be logged in first");
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await requestAdminAccess(adminKey);
      if (success) {
        toast.success("Admin access granted!");
        setShowDialog(false);
        setAdminKey("");
      } else {
        toast.error("Invalid admin key");
        setAdminKey("");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to verify admin key");
      setAdminKey("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.info("Signed out");
  };

  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (isAdmin) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="default" className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          Admin Mode
        </Badge>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (!user) {
    return (
      <Button variant="outline" size="sm" onClick={() => toast.info("Please sign in first")}>
        <Shield className="h-4 w-4 mr-2" />
        Admin Login
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
        <Shield className="h-4 w-4 mr-2" />
        Admin Login
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Admin Access</DialogTitle>
            <DialogDescription>
              Enter the admin key to access standards management and advanced features.
              You are logged in as {user.email}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="adminKey">Admin Key</Label>
              <Input
                id="adminKey"
                type="password"
                placeholder="Enter admin key..."
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isSubmitting && handleLogin()}
                disabled={isSubmitting}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleLogin} disabled={!adminKey.trim() || isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
