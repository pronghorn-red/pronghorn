import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronDown, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocsViewer } from "@/components/docs/DocsViewer";

interface Standard {
  id: string;
  code: string;
  title: string;
  description?: string;
  long_description?: string;
  parent_id?: string;
  children?: Standard[];
}

interface Category {
  id: string;
  name: string;
  description?: string;
  long_description?: string;
  standards: Standard[];
}

interface StandardsTreeSelectorProps {
  categories: Category[];
  selectedStandards: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
}

export function StandardsTreeSelector({
  categories,
  selectedStandards,
  onSelectionChange,
}: StandardsTreeSelectorProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedStandards, setExpandedStandards] = useState<Set<string>>(new Set());
  const [docsCategory, setDocsCategory] = useState<Category | null>(null);

  // Helper to get all descendant IDs
  const getAllDescendants = (standard: Standard): string[] => {
    const descendants: string[] = [standard.id];
    if (standard.children) {
      standard.children.forEach((child) => {
        descendants.push(...getAllDescendants(child));
      });
    }
    return descendants;
  };

  // Helper to get all standard IDs in a category
  const getAllCategoryStandards = (standards: Standard[]): string[] => {
    const ids: string[] = [];
    standards.forEach((standard) => {
      ids.push(...getAllDescendants(standard));
    });
    return ids;
  };

  // Check if all descendants are selected
  const areAllDescendantsSelected = (standard: Standard): boolean => {
    const descendants = getAllDescendants(standard);
    return descendants.every((id) => selectedStandards.has(id));
  };

  // Check if some (but not all) descendants are selected
  const areSomeDescendantsSelected = (standard: Standard): boolean => {
    const descendants = getAllDescendants(standard);
    const selectedCount = descendants.filter((id) => selectedStandards.has(id)).length;
    return selectedCount > 0 && selectedCount < descendants.length;
  };

  // Check if all standards in category are selected
  const areAllCategoryStandardsSelected = (standards: Standard[]): boolean => {
    const allIds = getAllCategoryStandards(standards);
    return allIds.length > 0 && allIds.every((id) => selectedStandards.has(id));
  };

  // Check if some standards in category are selected
  const areSomeCategoryStandardsSelected = (standards: Standard[]): boolean => {
    const allIds = getAllCategoryStandards(standards);
    const selectedCount = allIds.filter((id) => selectedStandards.has(id)).length;
    return selectedCount > 0 && selectedCount < allIds.length;
  };

  const toggleStandard = (standard: Standard) => {
    const newSelected = new Set(selectedStandards);
    const hasChildren = standard.children && standard.children.length > 0;
    
    if (!hasChildren) {
      // Leaf node - just toggle the standard itself
      if (newSelected.has(standard.id)) {
        newSelected.delete(standard.id);
      } else {
        newSelected.add(standard.id);
      }
    } else {
      // Has children - toggle all descendants
      const descendants = getAllDescendants(standard);
      const allSelected = areAllDescendantsSelected(standard);

      if (allSelected) {
        descendants.forEach((id) => newSelected.delete(id));
      } else {
        descendants.forEach((id) => newSelected.add(id));
      }
    }

    onSelectionChange(newSelected);
  };

  const toggleCategory = (standards: Standard[]) => {
    const newSelected = new Set(selectedStandards);
    const allIds = getAllCategoryStandards(standards);
    const allSelected = areAllCategoryStandardsSelected(standards);

    if (allSelected) {
      // Unselect all
      allIds.forEach((id) => newSelected.delete(id));
    } else {
      // Select all
      allIds.forEach((id) => newSelected.add(id));
    }

    onSelectionChange(newSelected);
  };

  const toggleExpandCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const toggleExpandStandard = (standardId: string) => {
    const newExpanded = new Set(expandedStandards);
    if (newExpanded.has(standardId)) {
      newExpanded.delete(standardId);
    } else {
      newExpanded.add(standardId);
    }
    setExpandedStandards(newExpanded);
  };

  const handleSelectAll = () => {
    const allIds = new Set<string>();
    categories.forEach((category) => {
      const categoryIds = getAllCategoryStandards(category.standards);
      categoryIds.forEach((id) => allIds.add(id));
    });
    onSelectionChange(allIds);
  };

  const handleSelectNone = () => {
    onSelectionChange(new Set());
  };

  const renderStandard = (standard: Standard, level: number = 0) => {
    const isExpanded = expandedStandards.has(standard.id);
    const hasChildren = standard.children && standard.children.length > 0;
    const isChecked = hasChildren 
      ? areAllDescendantsSelected(standard)
      : selectedStandards.has(standard.id);
    const isIndeterminate = hasChildren && !isChecked && areSomeDescendantsSelected(standard);

    return (
      <div key={standard.id} className="space-y-1">
        <div
          className="flex items-center gap-2 py-1 hover:bg-muted/50 rounded px-2"
          style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
        >
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => toggleExpandStandard(standard.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          )}
          {!hasChildren && <div className="w-5" />}
          <Checkbox
            id={`standard-${standard.id}`}
            checked={isIndeterminate ? "indeterminate" : isChecked}
            onCheckedChange={() => toggleStandard(standard)}
          />
          <Label
            htmlFor={`standard-${standard.id}`}
            className="text-sm cursor-pointer flex-1"
          >
            <span className="font-medium">{standard.code}</span> - {standard.title}
          </Label>
        </div>
        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {standard.children!.map((child) => renderStandard(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button variant="outline" size="sm" onClick={handleSelectNone}>
          Select None
        </Button>
      </div>
      <div className="space-y-2">
        {categories.map((category) => {
        const isExpanded = expandedCategories.has(category.id);
        const hasStandards = category.standards.length > 0;
        const allSelected = areAllCategoryStandardsSelected(category.standards);
        const someSelected = areSomeCategoryStandardsSelected(category.standards);

        return (
          <div key={category.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              {hasStandards && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => toggleExpandCategory(category.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              )}
              {!hasStandards && <div className="w-6" />}
              <Checkbox
                id={`category-${category.id}`}
                checked={someSelected && !allSelected ? "indeterminate" : allSelected}
                onCheckedChange={() => toggleCategory(category.standards)}
                disabled={!hasStandards}
              />
              <Label
                htmlFor={`category-${category.id}`}
                className="font-semibold cursor-pointer flex-1"
              >
                {category.name}
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setDocsCategory(category)}
                title="View documentation"
              >
                <BookOpen className="h-3.5 w-3.5" />
              </Button>
            </div>
            {category.description && (
              <p className="text-xs text-muted-foreground pl-14">{category.description}</p>
            )}
            {isExpanded && hasStandards && (
              <div className="space-y-1 pt-2">
                {category.standards.map((standard) => renderStandard(standard, 0))}
              </div>
            )}
          </div>
        );
      })}
      </div>

      {/* Docs Viewer */}
      {docsCategory && (
        <DocsViewer
          open={!!docsCategory}
          onClose={() => setDocsCategory(null)}
          entityType="standard_category"
          rootEntity={{
            id: docsCategory.id,
            name: docsCategory.name,
            description: docsCategory.description,
            long_description: docsCategory.long_description,
          }}
        />
      )}
    </div>
  );
}
