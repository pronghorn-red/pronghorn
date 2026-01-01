import { memo } from 'react';
import { EdgeProps, getBezierPath } from 'reactflow';

export const CustomEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  label,
  labelStyle,
  labelBgStyle,
  selected,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const strokeColor = style?.stroke as string || 'hsl(var(--primary))';
  const strokeWidth = (style?.strokeWidth as number) || 2;

  return (
    <>
      {/* Glow effect when selected */}
      {selected && (
        <path
          d={edgePath}
          fill="none"
          strokeWidth={strokeWidth + 8}
          stroke="rgba(249, 115, 22, 0.4)"
          className="react-flow__edge-path"
          style={{ filter: 'blur(4px)' }}
        />
      )}
      
      {/* Main edge path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        strokeWidth={selected ? strokeWidth + 1 : strokeWidth}
        stroke={selected ? '#f97316' : strokeColor}
        className="react-flow__edge-path"
        style={{
          transition: 'stroke 0.2s, stroke-width 0.2s',
        }}
      />
      
      {/* Label */}
      {label && (
        <foreignObject
          x={labelX - 50}
          y={labelY - 12}
          width={100}
          height={24}
          className="overflow-visible pointer-events-none"
        >
          <div
            className="flex items-center justify-center h-full"
            style={labelStyle as React.CSSProperties}
          >
            <span
              className="px-2 py-0.5 rounded text-xs bg-background/90 border border-border"
              style={labelBgStyle as React.CSSProperties}
            >
              {label}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  );
});

CustomEdge.displayName = 'CustomEdge';
