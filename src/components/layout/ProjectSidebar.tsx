import { ListTree, Layout, ShieldCheck, Hammer, Code, FileText, Settings as SettingsIcon, Menu, X, Archive, MessageSquare } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProjectUrl } from "@/hooks/useProjectUrl";
import { useIsMobile } from "@/hooks/use-mobile";

interface ProjectSidebarProps {
  projectId: string;
}

const activeNavItems = [
  { icon: SettingsIcon, label: "Settings", path: "settings" },
  { icon: Archive, label: "Artifacts", path: "artifacts" },
  { icon: MessageSquare, label: "Chat", path: "chat" },
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
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const { buildUrl } = useProjectUrl(projectId);

  // Close mobile menu when screen size changes
  useEffect(() => {
    if (!isMobile) {
      setIsMobileOpen(false);
    }
  }, [isMobile]);

  // Mobile menu button (rendered separately by parent)
  if (isMobile && !isMobileOpen) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsMobileOpen(true)}
        className="fixed bottom-4 left-4 z-[100] h-12 w-12 bg-card border border-border shadow-lg md:hidden"
        style={{ position: 'fixed' }}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && isMobileOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <aside
        className={`
          ${isMobile 
            ? "fixed top-14 left-0 bottom-0 z-50 w-64 shadow-lg md:hidden" 
            : `relative border-r border-border transition-all duration-300 ${isCollapsed ? "w-16" : "w-56"}`
          }
          bg-card h-full
        `}
      >
        <div className="h-full flex flex-col">
          {/* Header with close/collapse button */}
          <div className="flex items-center justify-between p-2 border-b border-border">
            {isMobile && (
              <span className="px-2 text-sm font-semibold">Menu</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => isMobile ? setIsMobileOpen(false) : setIsCollapsed(!isCollapsed)}
              className="h-8 w-8 ml-auto"
            >
              {isMobile ? (
                <X className="h-4 w-4" />
              ) : isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 space-y-1 flex flex-col overflow-y-auto">
            <div className="space-y-1">
              {activeNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={buildUrl(`/${item.path}`)}
                  onClick={() => isMobile && setIsMobileOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  activeClassName="bg-muted text-foreground"
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {(isMobile || !isCollapsed) && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>

            {/* Coming Soon Section */}
            <div className="mt-auto pt-4 border-t border-border space-y-1">
              {(isMobile || !isCollapsed) && (
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
                  {(isMobile || !isCollapsed) && (
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
    </>
  );
}
