import { Home, Library, Settings, User, Layers } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { AdminAccessButton } from "@/components/layout/AdminAccessButton";

export function PrimaryNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center px-6">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="text-white font-bold text-lg">E</span>
          </div>
          <span className="font-bold text-xl">Embly</span>
        </div>

        {/* Primary Navigation */}
        <nav className="flex items-center gap-1 flex-1">
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

        {/* User Menu */}
        <div className="flex items-center gap-3">
          <AdminAccessButton />
          <Button variant="ghost" size="icon" asChild>
            <NavLink to="/settings/organization">
              <Settings className="h-4 w-4" />
            </NavLink>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <NavLink to="/settings/profile">
              <User className="h-4 w-4" />
            </NavLink>
          </Button>
        </div>
      </div>
    </header>
  );
}
