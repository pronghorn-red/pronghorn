import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { RequirementsTree, Requirement, RequirementType } from "@/components/requirements/RequirementsTree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Upload, Sparkles } from "lucide-react";
import { useParams } from "react-router-dom";

// Mock data - hierarchical requirements
const mockRequirements: Requirement[] = [
  {
    id: "1",
    type: "EPIC",
    title: "User Authentication System",
    children: [
      {
        id: "1.1",
        type: "FEATURE",
        title: "Email/Password Login",
        children: [
          {
            id: "1.1.1",
            type: "STORY",
            title: "As a user, I want to log in with email and password",
            children: [
              {
                id: "1.1.1.1",
                type: "ACCEPTANCE_CRITERIA",
                title: "Email validation must be performed",
              },
              {
                id: "1.1.1.2",
                type: "ACCEPTANCE_CRITERIA",
                title: "Password must be hashed using bcrypt",
              },
            ],
          },
        ],
      },
      {
        id: "1.2",
        type: "FEATURE",
        title: "OAuth Integration",
        children: [
          {
            id: "1.2.1",
            type: "STORY",
            title: "As a user, I want to sign in with Google",
          },
        ],
      },
    ],
  },
  {
    id: "2",
    type: "EPIC",
    title: "Dashboard & Analytics",
    children: [
      {
        id: "2.1",
        type: "FEATURE",
        title: "Real-time Metrics Display",
        children: [
          {
            id: "2.1.1",
            type: "STORY",
            title: "As an admin, I want to see live system metrics",
          },
        ],
      },
    ],
  },
];

export default function Requirements() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [requirements, setRequirements] = useState<Requirement[]>(mockRequirements);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleNodeUpdate = (id: string, updates: Partial<Requirement>) => {
    const updateNode = (nodes: Requirement[]): Requirement[] => {
      return nodes.map((node) => {
        if (node.id === id) {
          return { ...node, ...updates };
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });
    };
    setRequirements(updateNode(requirements));
  };

  const handleNodeDelete = (id: string) => {
    const deleteNode = (nodes: Requirement[]): Requirement[] => {
      return nodes.filter((node) => {
        if (node.id === id) return false;
        if (node.children) {
          node.children = deleteNode(node.children);
        }
        return true;
      });
    };
    setRequirements(deleteNode(requirements));
  };

  const handleNodeAdd = (parentId: string | null, type: RequirementType) => {
    const newNode: Requirement = {
      id: `new-${Date.now()}`,
      type,
      title: `New ${type}`,
      children: [],
    };

    if (parentId === null) {
      setRequirements([...requirements, newNode]);
    } else {
      const addToParent = (nodes: Requirement[]): Requirement[] => {
        return nodes.map((node) => {
          if (node.id === parentId) {
            return {
              ...node,
              children: [...(node.children || []), newNode],
            };
          }
          if (node.children) {
            return { ...node, children: addToParent(node.children) };
          }
          return node;
        });
      };
      setRequirements(addToParent(requirements));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex">
        <ProjectSidebar projectId={projectId!} />
        
        <main className="flex-1 overflow-auto">
          <div className="container px-6 py-8 max-w-6xl">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold mb-2">Requirements</h1>
              <p className="text-muted-foreground">
                Manage your project requirements hierarchy
              </p>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search requirements..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <Button variant="outline" className="gap-2">
                <Upload className="h-4 w-4" />
                Import
              </Button>
              
              <Button variant="outline" className="gap-2">
                <Sparkles className="h-4 w-4" />
                AI Decompose
              </Button>
              
              <Button className="gap-2" onClick={() => handleNodeAdd(null, "EPIC")}>
                <Plus className="h-4 w-4" />
                Add Epic
              </Button>
            </div>

            {/* Requirements Tree */}
            <div className="bg-card border border-border rounded-lg p-4">
              <RequirementsTree
                requirements={requirements}
                onNodeSelect={setSelectedId}
                onNodeUpdate={handleNodeUpdate}
                onNodeDelete={handleNodeDelete}
                onNodeAdd={handleNodeAdd}
              />
            </div>

            {/* Empty State */}
            {requirements.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  No requirements yet. Start by adding an Epic or import from a document.
                </p>
                <Button className="gap-2" onClick={() => handleNodeAdd(null, "EPIC")}>
                  <Plus className="h-4 w-4" />
                  Add Your First Epic
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
