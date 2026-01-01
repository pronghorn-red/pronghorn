import { memo } from 'react';
import { getBezierPath, getStraightPath, getSmoothStepPath, BaseEdge, EdgeLabelRenderer } from 'reactflow';

interface CustomEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: any;
  targetPosition: any;
  style?: React.CSSProperties;
  label?: string | React.ReactNode;
  labelStyle?: React.CSSProperties;
  labelBgStyle?: React.CSSProperties;
  selected?: boolean;
  type?: string;  // React Flow passes the edge's type here
  data?: {
    edgeType?: string;
  };
}

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
  type,
  data,
}: CustomEdgeProps) => {
  // Get edge type from type prop (React Flow native), fallback to data.edgeType for legacy
  const edgeType = type || data?.edgeType || 'default';
  
  let edgePath: string;
  let labelX: number;
  let labelY: number;

  const pathParams = {
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  };

  switch (edgeType) {
    case 'straight':
      [edgePath, labelX, labelY] = getStraightPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
      });
      break;
    case 'smoothstep':
      [edgePath, labelX, labelY] = getSmoothStepPath(pathParams);
      break;
    case 'step':
      [edgePath, labelX, labelY] = getSmoothStepPath({
        ...pathParams,
        borderRadius: 0,
      });
      break;
    default:
      // Default to bezier curve
      [edgePath, labelX, labelY] = getBezierPath(pathParams);
  }

  // Extract stroke color and width from style prop, with defaults
  const strokeColor = (style?.stroke as string) || 'hsl(var(--primary))';
  const strokeWidth = (style?.strokeWidth as number) || 2;

  return (
    <>
      {/* Main edge path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        strokeWidth={selected ? strokeWidth + 1 : strokeWidth}
        stroke={selected ? '#f97316' : strokeColor}
        className="react-flow__edge-path"
        style={{
          filter: selected ? 'drop-shadow(0 0 6px rgba(249, 115, 22, 0.8))' : undefined,
          transition: 'stroke 0.2s, stroke-width 0.2s, filter 0.2s',
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
