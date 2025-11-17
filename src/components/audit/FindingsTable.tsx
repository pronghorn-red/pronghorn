import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface Finding {
  id: string;
  requirement: string;
  severity: Severity;
  filePath: string;
  lineNumber?: number;
  message: string;
  details?: string;
}

interface FindingsTableProps {
  findings: Finding[];
  onRowClick?: (finding: Finding) => void;
}

const severityColors = {
  CRITICAL: "bg-destructive/10 text-destructive hover:bg-destructive/20",
  HIGH: "bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-500/20",
  MEDIUM: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20",
  LOW: "bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20",
};

export function FindingsTable({ findings, onRowClick }: FindingsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const filteredFindings = findings.filter((finding) => {
    const matchesSearch =
      finding.requirement.toLowerCase().includes(searchQuery.toLowerCase()) ||
      finding.filePath.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity =
      severityFilter === "all" || finding.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search findings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          {filteredFindings.length} finding{filteredFindings.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Requirement</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFindings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No findings match your filters
                </TableCell>
              </TableRow>
            ) : (
              filteredFindings.map((finding) => (
                <>
                  <TableRow
                    key={finding.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleRow(finding.id)}
                  >
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        {expandedRows.has(finding.id) ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{finding.requirement}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={severityColors[finding.severity]}>
                        {finding.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {finding.filePath}
                        {finding.lineNumber && `:${finding.lineNumber}`}
                      </code>
                    </TableCell>
                    <TableCell className="max-w-md truncate">{finding.message}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick?.(finding);
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedRows.has(finding.id) && finding.details && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30">
                        <div className="py-3 px-4 space-y-2">
                          <h4 className="font-medium text-sm">Details</h4>
                          <p className="text-sm text-muted-foreground">{finding.details}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
