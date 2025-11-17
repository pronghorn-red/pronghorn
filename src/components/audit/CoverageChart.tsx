import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown } from "lucide-react";

interface CoverageData {
  overall: number;
  byCategory: {
    category: string;
    coverage: number;
    color: string;
  }[];
  trend?: number;
}

interface CoverageChartProps {
  data: CoverageData;
}

export function CoverageChart({ data }: CoverageChartProps) {
  const { overall, byCategory, trend } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coverage Overview</CardTitle>
        <CardDescription>Compliance coverage across all requirements</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Coverage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">{overall}%</span>
            {trend !== undefined && (
              <div className={`flex items-center gap-1 text-sm ${trend >= 0 ? "text-success" : "text-destructive"}`}>
                {trend >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{Math.abs(trend)}%</span>
              </div>
            )}
          </div>
          <Progress value={overall} className="h-3" />
          <p className="text-sm text-muted-foreground">Overall compliance coverage</p>
        </div>

        {/* Category Breakdown */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Coverage by Category</h4>
          {byCategory.map((category) => (
            <div key={category.category} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{category.category}</span>
                <span className="text-muted-foreground">{category.coverage}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${category.coverage}%`,
                    backgroundColor: category.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-success">
              {byCategory.filter((c) => c.coverage >= 90).length}
            </div>
            <div className="text-xs text-muted-foreground">High Coverage</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-warning">
              {byCategory.filter((c) => c.coverage >= 70 && c.coverage < 90).length}
            </div>
            <div className="text-xs text-muted-foreground">Medium Coverage</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-destructive">
              {byCategory.filter((c) => c.coverage < 70).length}
            </div>
            <div className="text-xs text-muted-foreground">Low Coverage</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
