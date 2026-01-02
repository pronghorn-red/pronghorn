import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Minus, Plus, RotateCcw } from "lucide-react";

interface FontScaleControlProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function FontScaleControl({
  value,
  onChange,
  min = 0.7,
  max = 1.5,
  step = 0.05,
}: FontScaleControlProps) {
  const percentage = Math.round(value * 100);
  
  const handleIncrement = () => {
    const newValue = Math.min(max, value + step);
    onChange(Number(newValue.toFixed(2)));
  };

  const handleDecrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(Number(newValue.toFixed(2)));
  };

  const handleReset = () => {
    onChange(1);
  };

  return (
    <div className="flex items-center gap-3">
      <Label className="text-xs text-muted-foreground whitespace-nowrap">
        Font Size
      </Label>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        onClick={handleDecrement}
        disabled={value <= min}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <div className="flex items-center gap-2 min-w-[120px]">
        <Slider
          value={[value]}
          onValueChange={([v]) => onChange(Number(v.toFixed(2)))}
          min={min}
          max={max}
          step={step}
          className="flex-1"
        />
        <span className="text-xs font-medium min-w-[40px] text-right">
          {percentage}%
        </span>
      </div>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        onClick={handleIncrement}
        disabled={value >= max}
      >
        <Plus className="h-3 w-3" />
      </Button>
      {value !== 1 && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleReset}
          title="Reset to 100%"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
