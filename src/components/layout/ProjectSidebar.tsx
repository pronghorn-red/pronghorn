import { ListTree, Layout, ShieldCheck, Hammer, Code, Settings as SettingsIcon } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ProjectSidebarProps {
  projectId: string;
}

const navItems = [
  { icon: ListTree, label: "Requirements", path: "requirements" },
  { icon: Layout, label: "Canvas", path: "canvas" },
  { icon: ShieldCheck, label: "Audit", path: "audit" },
  { icon: Hammer, label: "Build", path: "build" },
  { icon: Code, label: "Repository", path: "repository" },
  { icon: SettingsIcon, label: "Settings", path: "settings" },
];

export function ProjectSidebar({ projectId }: ProjectSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`relative border-r border-border bg-card transition-all duration-300 ${
        isCollapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="sticky top-14 h-[calc(100vh-3.5rem)] flex flex-col">
        {/* Collapse Toggle */}
        <div className="flex items-center justify-end p-2 border-b border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={`/project/${projectId}/${item.path}`}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              activeClassName="bg-muted text-foreground"
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
