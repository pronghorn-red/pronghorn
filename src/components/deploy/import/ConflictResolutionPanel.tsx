import React from 'react';
import { AlertTriangle, Check, X, ArrowRight, Plus, Ban } from 'lucide-react';
import { TableMatchResult, ColumnConflict } from '@/utils/tableMatching';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface ConflictResolutionPanelProps {
  matches: TableMatchResult[];
  onTableResolutionChange: (tableName: string, newStatus: 'new' | 'insert' | 'skip') => void;
  onConflictResolutionChange: (tableName: string, columnName: string, resolution: 'skip' | 'cast' | 'alter' | 'block') => void;
}

export const ConflictResolutionPanel: React.FC<ConflictResolutionPanelProps> = ({
  matches,
  onTableResolutionChange,
  onConflictResolutionChange,
}) => {
  // Filter to only show tables with matches or conflicts
  const tablesWithMatches = matches.filter(m => m.matchType !== 'new' || m.conflicts.length > 0);
  const tablesWithConflicts = matches.filter(m => m.conflicts.length > 0);
  
  if (tablesWithMatches.length === 0) {
    return (
      <div className="p-4 border rounded-lg bg-muted/30 text-center text-muted-foreground">
        <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
        <p className="text-sm">All tables will be created fresh. No conflicts detected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center gap-2 p-3 border rounded-lg bg-amber-500/10 border-amber-500/30">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
        <div className="text-sm">
          <span className="font-medium">
            {tablesWithMatches.length} table{tablesWithMatches.length > 1 ? 's' : ''} found with potential matches
          </span>
          {tablesWithConflicts.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400 ml-2">
              ({tablesWithConflicts.length} with type conflicts)
            </span>
          )}
        </div>
      </div>
      
      <ScrollArea className="h-[300px]">
        <Accordion type="multiple" className="space-y-2">
          {tablesWithMatches.map((match) => (
            <AccordionItem
              key={match.importTable}
              value={match.importTable}
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex items-center gap-3 text-left">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      match.status === 'conflict' && "border-amber-500 text-amber-600 dark:text-amber-400",
                      match.status === 'insert' && "border-blue-500 text-blue-600 dark:text-blue-400",
                      match.status === 'new' && "border-green-500 text-green-600 dark:text-green-400",
                      match.status === 'skip' && "border-muted-foreground text-muted-foreground"
                    )}
                  >
                    {match.matchScore}% match
                  </Badge>
                  <div>
                    <span className="font-medium">{match.importTable}</span>
                    {match.existingTable && match.existingTable !== match.importTable && (
                      <span className="text-muted-foreground ml-2">
                        → {match.existingTable}
                      </span>
                    )}
                  </div>
                  {match.conflicts.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {match.conflicts.length} conflict{match.conflicts.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              
              <AccordionContent className="pb-4">
                <div className="space-y-4 pt-2">
                  {/* Table action selection */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Table Action</Label>
                    <RadioGroup
                      value={match.status === 'conflict' ? 'insert' : match.status}
                      onValueChange={(value) => onTableResolutionChange(match.importTable, value as 'new' | 'insert' | 'skip')}
                      className="flex flex-wrap gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="new" id={`${match.importTable}-new`} />
                        <Label htmlFor={`${match.importTable}-new`} className="text-sm cursor-pointer">
                          <Plus className="h-3 w-3 inline mr-1" />
                          Create new table
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="insert" id={`${match.importTable}-insert`} />
                        <Label htmlFor={`${match.importTable}-insert`} className="text-sm cursor-pointer">
                          <ArrowRight className="h-3 w-3 inline mr-1" />
                          Insert into existing
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="skip" id={`${match.importTable}-skip`} />
                        <Label htmlFor={`${match.importTable}-skip`} className="text-sm cursor-pointer">
                          <Ban className="h-3 w-3 inline mr-1" />
                          Skip this table
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  {/* Column conflicts */}
                  {match.conflicts.length > 0 && match.status !== 'new' && match.status !== 'skip' && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Column Conflicts</Label>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium">Column</th>
                              <th className="px-3 py-2 text-left text-xs font-medium">Import Type</th>
                              <th className="px-3 py-2 text-left text-xs font-medium">Existing Type</th>
                              <th className="px-3 py-2 text-left text-xs font-medium">Resolution</th>
                            </tr>
                          </thead>
                          <tbody>
                            {match.conflicts.map((conflict) => (
                              <tr key={conflict.column} className="border-t border-border">
                                <td className="px-3 py-2 font-medium">{conflict.column}</td>
                                <td className="px-3 py-2 text-muted-foreground">{conflict.importType}</td>
                                <td className="px-3 py-2 text-muted-foreground">{conflict.existingType}</td>
                                <td className="px-3 py-2">
                                  <Select
                                    value={conflict.resolution}
                                    onValueChange={(value) => 
                                      onConflictResolutionChange(
                                        match.importTable, 
                                        conflict.column, 
                                        value as 'skip' | 'cast' | 'alter' | 'block'
                                      )
                                    }
                                  >
                                    <SelectTrigger className="h-7 text-xs w-[110px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="cast">Cast value</SelectItem>
                                      <SelectItem value="skip">Skip column</SelectItem>
                                      <SelectItem value="alter">Alter table</SelectItem>
                                      <SelectItem value="block">Block import</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {/* Missing columns info */}
                  {match.missingColumns.length > 0 && match.status !== 'new' && match.status !== 'skip' && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">New Columns (will be added)</Label>
                      <div className="flex flex-wrap gap-1">
                        {match.missingColumns.map((col) => (
                          <Badge key={col} variant="secondary" className="text-xs">
                            <Plus className="h-3 w-3 mr-1" />
                            {col}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Column matches info */}
                  {match.columnMatches.filter(cm => cm.existingColumn && cm.typeMatch).length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Matched Columns ({match.columnMatches.filter(cm => cm.existingColumn && cm.typeMatch).length})
                      </Label>
                      <div className="flex flex-wrap gap-1">
                        {match.columnMatches
                          .filter(cm => cm.existingColumn && cm.typeMatch)
                          .slice(0, 8)
                          .map((cm) => (
                            <Badge key={cm.importColumn} variant="outline" className="text-xs text-green-600 dark:text-green-400 border-green-500/30">
                              <Check className="h-3 w-3 mr-1" />
                              {cm.importColumn}
                            </Badge>
                          ))}
                        {match.columnMatches.filter(cm => cm.existingColumn && cm.typeMatch).length > 8 && (
                          <Badge variant="outline" className="text-xs">
                            +{match.columnMatches.filter(cm => cm.existingColumn && cm.typeMatch).length - 8} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </ScrollArea>
    </div>
  );
};

export default ConflictResolutionPanel;
