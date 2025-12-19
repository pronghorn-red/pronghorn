import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SQLStatement } from '@/utils/sqlGenerator';
import { ChevronDown, ChevronRight, Copy, Check, Database, Table2, Hash, FileInput, Ban } from 'lucide-react';
import { toast } from 'sonner';

interface SqlReviewPanelProps {
  statements: SQLStatement[];
  reviewed: boolean;
  onReviewedChange: (reviewed: boolean) => void;
  excludedStatements?: Set<number>;
  onExcludedChange?: (excluded: Set<number>) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'CREATE_TABLE': <Table2 className="h-4 w-4" />,
  'CREATE_INDEX': <Hash className="h-4 w-4" />,
  'INSERT': <FileInput className="h-4 w-4" />,
  'ALTER_TABLE': <Database className="h-4 w-4" />,
  'DROP_TABLE': <Database className="h-4 w-4" />
};

const TYPE_COLORS: Record<string, string> = {
  'CREATE_TABLE': 'bg-green-500/20 text-green-700 border-green-500/30',
  'CREATE_INDEX': 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  'INSERT': 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  'ALTER_TABLE': 'bg-purple-500/20 text-purple-700 border-purple-500/30',
  'DROP_TABLE': 'bg-red-500/20 text-red-700 border-red-500/30'
};

export default function SqlReviewPanel({
  statements,
  reviewed,
  onReviewedChange,
  excludedStatements = new Set(),
  onExcludedChange
}: SqlReviewPanelProps) {
  const [expandedStatements, setExpandedStatements] = useState<Set<number>>(new Set([0]));
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const toggleExpanded = (idx: number) => {
    setExpandedStatements(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(idx)) {
        newExpanded.delete(idx);
      } else {
        newExpanded.add(idx);
      }
      return newExpanded;
    });
  };

  const toggleExcluded = (idx: number) => {
    if (!onExcludedChange) return;
    const newExcluded = new Set(excludedStatements);
    if (newExcluded.has(idx)) {
      newExcluded.delete(idx);
    } else {
      newExcluded.add(idx);
    }
    onExcludedChange(newExcluded);
  };

  const copyToClipboard = async (sql: string, idx: number) => {
    await navigator.clipboard.writeText(sql);
    setCopiedIdx(idx);
    toast.success('SQL copied to clipboard');
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const copyAllToClipboard = async () => {
    const allSql = statements
      .filter((_, i) => !excludedStatements.has(i))
      .map(s => s.sql)
      .join('\n\n');
    await navigator.clipboard.writeText(allSql);
    toast.success('All included SQL statements copied to clipboard');
  };

  // Group statements by type for summary
  const createStatements = statements.filter(s => s.type === 'CREATE_TABLE');
  const indexStatements = statements.filter(s => s.type === 'CREATE_INDEX');
  const insertStatements = statements.filter(s => s.type === 'INSERT');

  const excludedIndexCount = indexStatements.filter((stmt) => {
    const fullIdx = statements.indexOf(stmt);
    return excludedStatements.has(fullIdx);
  }).length;

  const includedCount = statements.length - excludedStatements.size;

  const totalInsertRows = insertStatements.length > 0 
    ? insertStatements.reduce((acc, s) => {
        const match = s.description.match(/(\d+) total/);
        return match ? parseInt(match[1], 10) : acc;
      }, 0)
    : 0;

  // Bulk actions
  const includeAll = () => {
    onExcludedChange?.(new Set());
  };

  const excludeAllIndexes = () => {
    const indexIdxs = new Set<number>();
    statements.forEach((s, i) => {
      if (s.type === 'CREATE_INDEX') {
        indexIdxs.add(i);
      }
    });
    onExcludedChange?.(indexIdxs);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className={TYPE_COLORS['CREATE_TABLE']}>
          {createStatements.length} CREATE TABLE
        </Badge>
        <Badge variant="outline" className={TYPE_COLORS['CREATE_INDEX']}>
          {indexStatements.length} CREATE INDEX
          {excludedIndexCount > 0 && (
            <span className="ml-1 text-muted-foreground">({excludedIndexCount} excluded)</span>
          )}
        </Badge>
        <Badge variant="outline" className={TYPE_COLORS['INSERT']}>
          {insertStatements.length} INSERT batches
          {totalInsertRows > 0 && ` (${totalInsertRows} rows)`}
        </Badge>
        
        <div className="flex-1" />
        
        {onExcludedChange && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={includeAll}>
              Include All
            </Button>
            <Button variant="outline" size="sm" onClick={excludeAllIndexes}>
              <Ban className="h-3 w-3 mr-1" />
              Exclude Indexes
            </Button>
          </div>
        )}
        
        <Button variant="outline" size="sm" onClick={copyAllToClipboard}>
          <Copy className="h-4 w-4 mr-1" />
          Copy All
        </Button>
      </div>

      {/* Statements List */}
      <div className="flex-1 border rounded-lg overflow-hidden min-h-0">
        <ScrollArea className="h-full">
          <div className="divide-y divide-border">
            {statements.map((stmt, idx) => {
              const isExpanded = expandedStatements.has(idx);
              const isCopied = copiedIdx === idx;
              const isExcluded = excludedStatements.has(idx);
              
              return (
                <div key={idx} className="flex flex-col">
                  {/* Header Row - Always visible */}
                  <div 
                    className={cn(
                      "flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer select-none",
                      isExcluded && "opacity-50 bg-muted/20"
                    )}
                    onClick={() => toggleExpanded(idx)}
                  >
                    {/* Include/Exclude checkbox */}
                    {onExcludedChange && (
                      <Checkbox
                        checked={!isExcluded}
                        onCheckedChange={() => toggleExcluded(idx)}
                        onClick={(e) => e.stopPropagation()}
                        title={isExcluded ? "Click to include" : "Click to exclude"}
                      />
                    )}
                    
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    
                    <Badge 
                      variant="outline" 
                      className={cn("flex items-center gap-1 shrink-0", TYPE_COLORS[stmt.type])}
                    >
                      {TYPE_ICONS[stmt.type]}
                      {stmt.type.replace('_', ' ')}
                    </Badge>
                    
                    <span className={cn(
                      "flex-1 text-sm truncate",
                      isExcluded && "line-through"
                    )}>
                      {stmt.description}
                    </span>
                    
                    {isExcluded && (
                      <Badge variant="outline" className="text-muted-foreground shrink-0">
                        Excluded
                      </Badge>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(stmt.sql, idx);
                      }}
                    >
                      {isCopied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  
                  {/* Expandable Content */}
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <pre className={cn(
                        "p-3 rounded-lg bg-[#1e1e1e] text-[#d4d4d4] text-xs font-mono overflow-x-auto max-h-[300px]",
                        "whitespace-pre-wrap break-words",
                        isExcluded && "opacity-50"
                      )}>
                        {stmt.sql}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Included count */}
      {excludedStatements.size > 0 && (
        <div className="text-sm text-muted-foreground">
          {includedCount} of {statements.length} statements will be executed
        </div>
      )}

      {/* Review Confirmation */}
      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border">
        <Checkbox
          id="reviewed"
          checked={reviewed}
          onCheckedChange={(checked) => onReviewedChange(!!checked)}
        />
        <Label htmlFor="reviewed" className="flex-1 cursor-pointer">
          I have reviewed the SQL statements above and confirm they are correct
        </Label>
      </div>

      {!reviewed && (
        <p className="text-sm text-amber-600 flex items-center gap-1">
          You must review and confirm the SQL statements before proceeding
        </p>
      )}
    </div>
  );
}
