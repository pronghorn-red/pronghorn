import { useRef, type PointerEvent } from 'react';
import { useReactFlow, useStore, type Node } from 'reactflow';
import { getSvgPathFromStroke } from '@/lib/lassoUtils';

type NodePoints = ([number, number] | [number, number, number])[];
type NodePointObject = Record<string, NodePoints>;

export function Lasso({ 
  partial, 
  setNodes 
}: { 
  partial: boolean;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
}) {
  const { getNodes, flowToScreenPosition } = useReactFlow();
  const { width, height } = useStore((state) => ({
    width: state.width,
    height: state.height,
  }));
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctx = useRef<CanvasRenderingContext2D | undefined | null>(null);

  const nodePoints = useRef<NodePointObject>({});
  const pointRef = useRef<[number, number][]>([]);

  function handlePointerDown(e: PointerEvent) {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    
    // Get canvas bounding rect to account for offset
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const nextPoints = [[x, y]] satisfies [number, number][];
    pointRef.current = nextPoints;

    nodePoints.current = {};
    const nodes = getNodes();
    for (const node of nodes) {
      const { x, y } = node.position;
      const width = (node.width as number) || 150;
      const height = (node.height as number) || 40;
      const points = [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ] satisfies NodePoints;
      nodePoints.current[node.id] = points;
    }

    ctx.current = canvas.current?.getContext('2d');
    if (!ctx.current) return;
    ctx.current.lineWidth = 1;
    ctx.current.fillStyle = 'rgba(0, 89, 220, 0.08)';
    ctx.current.strokeStyle = 'rgba(0, 89, 220, 0.8)';
  }

  function handlePointerMove(e: PointerEvent) {
    if (e.buttons !== 1) return;
    
    // Get canvas bounding rect to account for offset
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const points = pointRef.current;
    const nextPoints = [...points, [x, y]] satisfies [number, number][];
    pointRef.current = nextPoints;

    const path = new Path2D(getSvgPathFromStroke(nextPoints));

    if (!ctx.current) return;
    ctx.current.clearRect(0, 0, width, height);
    ctx.current.fill(path);
    ctx.current.stroke(path);

    const nodesToSelect = new Set<string>();

    for (const [nodeId, points] of Object.entries(nodePoints.current)) {
      const rect = canvas.current?.getBoundingClientRect();
      if (!rect) continue;

      if (partial) {
        for (const point of points) {
          const screenPos = flowToScreenPosition({ x: point[0], y: point[1] });
          const localX = screenPos.x - rect.left;
          const localY = screenPos.y - rect.top;
          if (ctx.current.isPointInPath(path, localX, localY)) {
            nodesToSelect.add(nodeId);
            break;
          }
        }
      } else {
        let allPointsInPath = true;
        for (const point of points) {
          const screenPos = flowToScreenPosition({ x: point[0], y: point[1] });
          const localX = screenPos.x - rect.left;
          const localY = screenPos.y - rect.top;
          if (!ctx.current.isPointInPath(path, localX, localY)) {
            allPointsInPath = false;
            break;
          }
        }
        if (allPointsInPath) {
          nodesToSelect.add(nodeId);
        }
      }
    }

    setNodes((nodes) =>
      nodes.map((node) => ({
        ...node,
        selected: nodesToSelect.has(node.id),
      })),
    );
  }

  function handlePointerUp(e: PointerEvent) {
    (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    pointRef.current = [];
    if (ctx.current) {
      ctx.current.clearRect(0, 0, width, height);
    }
  }

  return (
    <canvas
      ref={canvas}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'all',
        zIndex: 10,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
