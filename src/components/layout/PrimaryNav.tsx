import { useState } from "react";
import { Home, Library, Settings, User, Layers, LogIn, LogOut, Menu } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { AdminAccessButton } from "@/components/layout/AdminAccessButton";
import { PronghornLogo } from "@/components/layout/PronghornLogo";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function PrimaryNav() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/dashboard");
    setMobileOpen(false);
  };

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center px-4 md:px-6">
        {/* Logo */}
        <NavLink 
          to="/" 
          className="flex items-center gap-2 mr-4 md:mr-8 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <div className="rounded-lg">
            <PronghornLogo className="h-8 w-8" />
          </div>
          <span className="font-bold text-xl">Pronghorn</span>
        </NavLink>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          <NavLink
            to="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            activeClassName="bg-muted text-foreground"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </NavLink>
          <NavLink
            to="/standards"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            activeClassName="bg-muted text-foreground"
          >
            <Library className="h-4 w-4" />
            Standards
          </NavLink>
          <NavLink
            to="/tech-stacks"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            activeClassName="bg-muted text-foreground"
          >
            <Layers className="h-4 w-4" />
            Tech Stacks
          </NavLink>
        </nav>

        {/* Desktop User Menu */}
        <div className="hidden md:flex items-center gap-3">
          <AdminAccessButton />
          {user ? (
            <>
              <Button variant="ghost" size="icon" asChild>
                <NavLink to="/settings/organization">
                  <Settings className="h-4 w-4" />
                </NavLink>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </>
          ) : (
            <Button variant="default" size="sm" asChild>
              <NavLink to="/auth">
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </NavLink>
            </Button>
          )}
        </div>

        {/* Mobile Menu */}
        <div className="flex md:hidden items-center gap-2 ml-auto">
          <AdminAccessButton />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 mt-6">
                <NavLink
                  to="/dashboard"
                  className="flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  activeClassName="bg-muted text-foreground"
                  onClick={handleNavClick}
                >
                  <Home className="h-5 w-5" />
                  Dashboard
                </NavLink>
                <NavLink
                  to="/standards"
                  className="flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  activeClassName="bg-muted text-foreground"
                  onClick={handleNavClick}
                >
                  <Library className="h-5 w-5" />
                  Standards
                </NavLink>
                <NavLink
                  to="/tech-stacks"
                  className="flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  activeClassName="bg-muted text-foreground"
                  onClick={handleNavClick}
                >
                  <Layers className="h-5 w-5" />
                  Tech Stacks
                </NavLink>
                {user && (
                  <NavLink
                    to="/settings/organization"
                    className="flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    activeClassName="bg-muted text-foreground"
                    onClick={handleNavClick}
                  >
                    <Settings className="h-5 w-5" />
                    Settings
                  </NavLink>
                )}
                <div className="border-t my-2" />
                {user ? (
                  <Button variant="ghost" className="justify-start" onClick={handleSignOut}>
                    <LogOut className="h-5 w-5 mr-3" />
                    Sign Out
                  </Button>
                ) : (
                  <Button variant="default" asChild onClick={handleNavClick}>
                    <NavLink to="/auth" className="flex items-center gap-3">
                      <LogIn className="h-5 w-5" />
                      Sign In
                    </NavLink>
                  </Button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
