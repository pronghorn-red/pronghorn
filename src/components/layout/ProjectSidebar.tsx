import { ListTree, Layout, ShieldCheck, Hammer, Code, FileText, Settings as SettingsIcon } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProjectUrl } from "@/hooks/useProjectUrl";

interface ProjectSidebarProps {
  projectId: string;
}

const activeNavItems = [
  { icon: SettingsIcon, label: "Settings", path: "settings" },
  { icon: ListTree, label: "Requirements", path: "requirements" },
  { icon: ShieldCheck, label: "Standards", path: "standards" },
  { icon: Layout, label: "Canvas", path: "canvas" },
  { icon: FileText, label: "Specifications", path: "specifications" },
];

const comingSoonItems = [
  { icon: Hammer, label: "Build" },
  { icon: Code, label: "Repository" },
];

export function ProjectSidebar({ projectId }: ProjectSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { buildUrl } = useProjectUrl(projectId);

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
        <nav className="flex-1 p-2 space-y-1 flex flex-col">
          <div className="space-y-1">
            {activeNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={buildUrl(`/${item.path}`)}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                activeClassName="bg-muted text-foreground"
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>

          {/* Coming Soon Section */}
          <div className="mt-auto pt-4 border-t border-border space-y-1">
            {!isCollapsed && (
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                Coming Soon
              </div>
            )}
            {comingSoonItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && (
                  <div className="flex items-center justify-between flex-1">
                    <span>{item.label}</span>
                    <Badge variant="secondary" className="text-xs">Soon</Badge>
                  </div>
                )}
              </div>
            ))}
          </div>
        </nav>
      </div>
    </aside>
  );
}
