import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { CoverageChart } from "@/components/audit/CoverageChart";
import { FindingsTable, Finding } from "@/components/audit/FindingsTable";
import { Button } from "@/components/ui/button";
import { useParams, useNavigate } from "react-router-dom";
import { PlayCircle, History } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Mock data
const mockCoverageData = {
  overall: 87,
  trend: 5,
  byCategory: [
    { category: "Security", coverage: 92, color: "#10b981" },
    { category: "Accessibility", coverage: 75, color: "#f59e0b" },
    { category: "Performance", coverage: 88, color: "#3b82f6" },
    { category: "Authentication", coverage: 95, color: "#8b5cf6" },
    { category: "Data Validation", coverage: 82, color: "#14b8a6" },
  ],
};

const mockFindings: Finding[] = [
  {
    id: "1",
    requirement: "Input validation on login form",
    severity: "CRITICAL",
    filePath: "src/components/auth/LoginForm.tsx",
    lineNumber: 45,
    message: "Email input lacks proper validation",
    details: "The email input field does not validate the email format before submission. This could lead to invalid data in the database and security issues.",
  },
  {
    id: "2",
    requirement: "Password hashing with bcrypt",
    severity: "HIGH",
    filePath: "src/api/auth/register.ts",
    lineNumber: 78,
    message: "Password stored without proper hashing",
    details: "Passwords are being stored in plain text. Implement bcrypt hashing with appropriate salt rounds (minimum 10).",
  },
  {
    id: "3",
    requirement: "ARIA labels for form inputs",
    severity: "MEDIUM",
    filePath: "src/components/forms/TextInput.tsx",
    lineNumber: 23,
    message: "Missing aria-label attribute",
    details: "Form inputs should have aria-label or aria-labelledby attributes for screen reader accessibility.",
  },
  {
    id: "4",
    requirement: "Rate limiting on API endpoints",
    severity: "HIGH",
    filePath: "src/api/middleware/rateLimit.ts",
    message: "Rate limiting not implemented",
    details: "API endpoints lack rate limiting, making them vulnerable to DoS attacks. Implement rate limiting middleware.",
  },
];

export default function Audit() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [selectedRun, setSelectedRun] = useState("latest");

  const handleViewCode = (finding: Finding) => {
    navigate(`/project/${projectId}/repository?file=${finding.filePath}&line=${finding.lineNumber}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex">
        <ProjectSidebar projectId={projectId!} />
        
        <main className="flex-1">
          <div className="container px-6 py-8 max-w-7xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold mb-2">Audit</h1>
                <p className="text-muted-foreground">
                  Compliance audits and coverage reports
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <Select value={selectedRun} onValueChange={setSelectedRun}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest Run</SelectItem>
                    <SelectItem value="run-2">2 hours ago</SelectItem>
                    <SelectItem value="run-3">Yesterday</SelectItem>
                    <SelectItem value="run-4">2 days ago</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button variant="outline" className="gap-2">
                  <History className="h-4 w-4" />
                  History
                </Button>
                
                <Button className="gap-2">
                  <PlayCircle className="h-4 w-4" />
                  Run Audit
                </Button>
              </div>
            </div>

            {/* Coverage Chart */}
            <div className="mb-8">
              <CoverageChart data={mockCoverageData} />
            </div>

            {/* Findings Table */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Audit Findings</h2>
              <FindingsTable findings={mockFindings} onRowClick={handleViewCode} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
