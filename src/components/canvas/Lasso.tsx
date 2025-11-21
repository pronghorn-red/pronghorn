import { useRef, type PointerEvent } from 'react';
import { useReactFlow, useStore, type Node } from 'reactflow';
import { pointsToPath } from '@/lib/lassoUtils';

type NodePoints = ([number, number] | [number, number, number])[];
type NodePointObject = Record<string, NodePoints>;

export function Lasso({ 
  partial, 
  setNodes 
}: { 
  partial: boolean;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
}) {
  const { flowToScreenPosition, getNodes } = useReactFlow();
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
    
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const points = pointRef.current;
    const nextPoints = [...points, [x, y]] satisfies [number, number][];
    pointRef.current = nextPoints;

    const path = new Path2D(pointsToPath(nextPoints));

    if (!ctx.current) return;
    ctx.current.clearRect(0, 0, width, height);
    ctx.current.fill(path);
    ctx.current.stroke(path);

    if (nextPoints.length < 2) return;

    const xs = nextPoints.map(([px]) => px);
    const ys = nextPoints.map(([, py]) => py);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const nodesToSelect = new Set<string>();
    const canvasRect = canvas.current?.getBoundingClientRect();
    if (!canvasRect) return;

    for (const [nodeId, points] of Object.entries(nodePoints.current)) {
      if (partial) {
        // Partial selection: any corner inside lasso bounding box
        for (const point of points) {
          const screenPos = flowToScreenPosition({ x: point[0], y: point[1] });
          const localX = screenPos.x - canvasRect.left;
          const localY = screenPos.y - canvasRect.top;
          if (localX >= minX && localX <= maxX && localY >= minY && localY <= maxY) {
            nodesToSelect.add(nodeId);
            break;
          }
        }
      } else {
        // Full selection: all corners inside lasso bounding box
        let allPointsInBox = true;
        for (const point of points) {
          const screenPos = flowToScreenPosition({ x: point[0], y: point[1] });
          const localX = screenPos.x - canvasRect.left;
          const localY = screenPos.y - canvasRect.top;
          if (localX < minX || localX > maxX || localY < minY || localY > maxY) {
            allPointsInBox = false;
            break;
          }
        }
        if (allPointsInBox) {
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
