import React, { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, Table2, Braces, List, Minus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NormalizationStrategy, JsonStructureNode } from '@/utils/parseJson';

interface JsonNormalizationSelectorProps {
  structure: JsonStructureNode[];
  strategy: NormalizationStrategy;
  onStrategyChange: (strategy: NormalizationStrategy) => void;
  customPaths: Set<string>;
  onCustomPathsChange: (paths: Set<string>) => void;
}

export default function JsonNormalizationSelector({
  structure,
  strategy,
  onStrategyChange,
  customPaths,
  onCustomPathsChange
}: JsonNormalizationSelectorProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Calculate table count based on strategy
  const tableCount = useMemo(() => {
    let count = 1; // Root table always exists
    
    const countTables = (nodes: JsonStructureNode[], parentWillBeTable: boolean = true) => {
      for (const node of nodes) {
        if (node.type === 'array') {
          // Arrays always become tables
          count++;
          if (node.children) {
            countTables(node.children, true);
          }
        } else if (node.type === 'object') {
          let willBeTable = false;
          
          if (strategy === 'full') {
            willBeTable = true;
          } else if (strategy === 'partial') {
            willBeTable = node.hasNestedArrays;
          } else if (strategy === 'custom') {
            willBeTable = customPaths.has(node.path);
          }
          
          if (willBeTable) {
            count++;
          }
          
          if (node.children) {
            countTables(node.children, willBeTable);
          }
        }
      }
    };
    
    countTables(structure);
    return count;
  }, [structure, strategy, customPaths]);

  // Get list of table names for preview
  const tableNames = useMemo(() => {
    const names: string[] = ['root'];
    
    const collectNames = (nodes: JsonStructureNode[]) => {
      for (const node of nodes) {
        if (node.type === 'array') {
          names.push(node.key);
          if (node.children) {
            collectNames(node.children);
          }
        } else if (node.type === 'object') {
          let willBeTable = false;
          
          if (strategy === 'full') {
            willBeTable = true;
          } else if (strategy === 'partial') {
            willBeTable = node.hasNestedArrays;
          } else if (strategy === 'custom') {
            willBeTable = customPaths.has(node.path);
          }
          
          if (willBeTable) {
            names.push(node.key);
          }
          
          if (node.children) {
            collectNames(node.children);
          }
        }
      }
    };
    
    collectNames(structure);
    return names;
  }, [structure, strategy, customPaths]);

  const toggleExpand = (path: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleCustomPath = (path: string, isArray: boolean) => {
    // Arrays can't be toggled - they always become tables
    if (isArray) return;
    
    const next = new Set(customPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    onCustomPathsChange(next);
  };

  const renderNode = (node: JsonStructureNode, depth: number = 0): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.path);
    const isArray = node.type === 'array';
    
    // Determine if this node will become a table
    let willBeTable = isArray; // Arrays always become tables
    if (!isArray && node.type === 'object') {
      if (strategy === 'full') {
        willBeTable = true;
      } else if (strategy === 'partial') {
        willBeTable = node.hasNestedArrays;
      } else if (strategy === 'custom') {
        willBeTable = customPaths.has(node.path);
      }
    }

    const isCheckable = strategy === 'custom' && node.type === 'object';
    const isChecked = isArray || (strategy === 'custom' && customPaths.has(node.path));

    return (
      <div key={node.path} className="select-none">
        <div
          className={cn(
            "flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors",
            willBeTable && "bg-primary/5"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {/* Expand/collapse button */}
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.path)}
              className="p-0.5 hover:bg-muted rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground/50 ml-0.5" />
          )}

          {/* Checkbox for custom mode */}
          {strategy === 'custom' && (
            <Checkbox
              checked={isChecked}
              disabled={isArray}
              onCheckedChange={() => toggleCustomPath(node.path, isArray)}
              className={cn(isArray && "opacity-50")}
            />
          )}

          {/* Icon */}
          {isArray ? (
            <List className="h-4 w-4 text-blue-500" />
          ) : (
            <Braces className="h-4 w-4 text-amber-500" />
          )}

          {/* Name and type */}
          <span className={cn(
            "font-medium text-sm",
            willBeTable && "text-primary"
          )}>
            {node.key}
          </span>
          
          <span className="text-xs text-muted-foreground">
            ({isArray ? 'array' : 'object'})
          </span>

          {/* Metadata */}
          <div className="ml-auto flex items-center gap-2">
            {isArray && node.itemCount !== undefined && (
              <Badge variant="secondary" className="text-xs py-0">
                {node.itemCount} item{node.itemCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {!isArray && node.fieldCount > 0 && (
              <Badge variant="outline" className="text-xs py-0">
                {node.fieldCount} field{node.fieldCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {willBeTable && (
              <Badge className="text-xs py-0 bg-primary/20 text-primary border-primary/30">
                <Table2 className="h-3 w-3 mr-1" />
                Table
              </Badge>
            )}
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Expand all by default
  React.useEffect(() => {
    const allPaths = new Set<string>();
    const collectPaths = (nodes: JsonStructureNode[]) => {
      for (const node of nodes) {
        allPaths.add(node.path);
        if (node.children) {
          collectPaths(node.children);
        }
      }
    };
    collectPaths(structure);
    setExpandedNodes(allPaths);
  }, [structure]);

  // When switching to partial/full, update custom paths accordingly
  React.useEffect(() => {
    if (strategy === 'partial') {
      // Set custom paths to match partial strategy
      const paths = new Set<string>();
      const collectPartialPaths = (nodes: JsonStructureNode[]) => {
        for (const node of nodes) {
          if (node.type === 'object' && node.hasNestedArrays) {
            paths.add(node.path);
          }
          if (node.children) {
            collectPartialPaths(node.children);
          }
        }
      };
      collectPartialPaths(structure);
      onCustomPathsChange(paths);
    } else if (strategy === 'full') {
      // Set all object paths
      const paths = new Set<string>();
      const collectAllPaths = (nodes: JsonStructureNode[]) => {
        for (const node of nodes) {
          if (node.type === 'object') {
            paths.add(node.path);
          }
          if (node.children) {
            collectAllPaths(node.children);
          }
        }
      };
      collectAllPaths(structure);
      onCustomPathsChange(paths);
    }
  }, [strategy, structure]);

  return (
    <div className="space-y-6">
      {/* Strategy Selection */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Normalization Strategy</Label>
        <RadioGroup
          value={strategy}
          onValueChange={(v) => onStrategyChange(v as NormalizationStrategy)}
          className="space-y-2"
        >
          <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
            <RadioGroupItem value="partial" className="mt-0.5" />
            <div className="space-y-1">
              <span className="font-medium">Partially Normalized</span>
              <p className="text-sm text-muted-foreground">
                Arrays become tables. Objects with nested arrays become tables. Simple nested objects are flattened into columns.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
            <RadioGroupItem value="full" className="mt-0.5" />
            <div className="space-y-1">
              <span className="font-medium">Fully Normalized</span>
              <p className="text-sm text-muted-foreground">
                All arrays and all nested objects become separate tables with foreign key relationships.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
            <RadioGroupItem value="custom" className="mt-0.5" />
            <div className="space-y-1">
              <span className="font-medium">User Selected</span>
              <p className="text-sm text-muted-foreground">
                Choose which objects become separate tables. Arrays always become tables.
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

      {/* Structure Tree */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">JSON Structure</Label>
          {strategy === 'custom' && (
            <span className="text-xs text-muted-foreground">
              Check objects to make them separate tables
            </span>
          )}
        </div>
        
        <ScrollArea className="h-[300px] rounded-lg border border-border">
          <div className="p-2">
            {structure.length > 0 ? (
              structure.map(node => renderNode(node))
            ) : (
              <div className="flex items-center justify-center h-full py-8 text-muted-foreground">
                No nested structures found in JSON
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Preview */}
      <div className="space-y-2 p-4 rounded-lg bg-muted/50 border border-border">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-primary" />
          <span className="font-medium">{tableCount} table{tableCount !== 1 ? 's' : ''} will be created</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tableNames.slice(0, 10).map((name) => (
            <Badge key={name} variant="secondary" className="text-xs">
              {name}
            </Badge>
          ))}
          {tableNames.length > 10 && (
            <Badge variant="outline" className="text-xs">
              +{tableNames.length - 10} more
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
