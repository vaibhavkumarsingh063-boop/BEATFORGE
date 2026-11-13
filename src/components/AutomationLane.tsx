import React, { useState, useRef, useEffect } from 'react';
import { Sliders, Trash2, Plus } from 'lucide-react';
import { AutomationClip, AutomationPoint, Track } from '../types/daw';

interface AutomationLaneProps {
  track: Track;
  automationClip?: AutomationClip;
  totalBars: number;
  zoomLevel: number;
  onChangeClip: (clip: AutomationClip) => void;
  onTargetParamChange: (param: AutomationClip['targetParam']) => void;
  onClearPoints: (trackId: string, param: AutomationClip['targetParam']) => void;
}

const TARGET_PARAMS: { value: AutomationClip['targetParam']; label: string; color: string }[] = [
  { value: 'volume', label: 'Volume', color: '#a855f7' },
  { value: 'pan', label: 'Panning', color: '#06b6d4' },
  { value: 'filterCutoff', label: 'Filter Cutoff', color: '#10b981' },
  { value: 'reverbWet', label: 'Reverb Mix', color: '#c084fc' },
  { value: 'delayWet', label: 'Delay Mix', color: '#38bdf8' }
];

export const AutomationLaneHeader: React.FC<{
  track: Track;
  targetParam: AutomationClip['targetParam'];
  pointCount: number;
  onTargetParamChange: (param: AutomationClip['targetParam']) => void;
  onClearPoints: () => void;
}> = ({ targetParam, pointCount, onTargetParamChange, onClearPoints }) => {
  return (
    <div className="h-20 bg-[#0d1019] border-b border-[#1b1f2e] px-3 py-2 flex flex-col justify-between pl-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
          <Sliders className="w-3 h-3" />
          Automation ({pointCount} pts)
        </span>
        <button
          onClick={onClearPoints}
          title="Clear automation points"
          className="text-gray-500 hover:text-rose-400 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <select
        value={targetParam}
        onChange={(e) => onTargetParamChange(e.target.value as AutomationClip['targetParam'])}
        className="w-full bg-[#161b2a] border border-[#283148] rounded px-2 py-1 text-[11px] font-semibold text-gray-200 outline-none cursor-pointer"
      >
        {TARGET_PARAMS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export const AutomationLaneGrid: React.FC<AutomationLaneProps> = ({
  track,
  automationClip,
  totalBars,
  zoomLevel,
  onChangeClip
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);

  const param = automationClip?.targetParam || 'volume';
  const paramMeta = TARGET_PARAMS.find((p) => p.value === param) || TARGET_PARAMS[0];
  const color = automationClip?.color || paramMeta.color;
  const points: AutomationPoint[] = automationClip?.points || [];
  const sortedPoints = [...points].sort((a, b) => a.bar - b.bar);

  const laneWidth = totalBars * zoomLevel;
  const laneHeight = 80; // matches h-20

  const getCoords = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { bar: 0, value: 0.5 };
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(laneWidth, clientX - rect.left));
    const y = Math.max(0, Math.min(laneHeight, clientY - rect.top));
    const bar = Math.round((x / zoomLevel) * 4) / 4;
    const value = Math.max(0, Math.min(1, 1 - y / laneHeight));
    return { bar, value };
  };

  useEffect(() => {
    if (!draggingPointId) return;

    const handleMove = (e: MouseEvent) => {
      const { bar, value } = getCoords(e.clientX, e.clientY);
      const nextPoints = points.map((pt) => (pt.id === draggingPointId ? { ...pt, bar, value } : pt));
      onChangeClip({
        id: automationClip?.id || `auto-${track.id}-${param}`,
        trackId: track.id,
        name: `${track.name} ${paramMeta.label}`,
        targetParam: param,
        points: nextPoints,
        color
      });
    };

    const handleUp = () => setDraggingPointId(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingPointId, points, automationClip, track.id, track.name, param, paramMeta.label, color, zoomLevel]);

  const handleLaneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.auto-point')) return;
    const { bar, value } = getCoords(e.clientX, e.clientY);
    const newPt: AutomationPoint = {
      id: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      bar,
      value
    };
    onChangeClip({
      id: automationClip?.id || `auto-${track.id}-${param}`,
      trackId: track.id,
      name: `${track.name} ${paramMeta.label}`,
      targetParam: param,
      points: [...points, newPt],
      color
    });
  };

  const handleDeletePoint = (e: React.MouseEvent, ptId: string) => {
    e.stopPropagation();
    e.preventDefault();
    onChangeClip({
      id: automationClip?.id || `auto-${track.id}-${param}`,
      trackId: track.id,
      name: `${track.name} ${paramMeta.label}`,
      targetParam: param,
      points: points.filter((p) => p.id !== ptId),
      color
    });
  };

  const polyPoints =
    sortedPoints.length > 0
      ? [
          `0,${(1 - sortedPoints[0].value) * laneHeight}`,
          ...sortedPoints.map((p) => `${p.bar * zoomLevel},${(1 - p.value) * laneHeight}`),
          `${laneWidth},${(1 - sortedPoints[sortedPoints.length - 1].value) * laneHeight}`
        ].join(' ')
      : `0,${laneHeight * 0.5} ${laneWidth},${laneHeight * 0.5}`;

  return (
    <div
      ref={containerRef}
      onClick={handleLaneClick}
      className="h-20 border-b border-[#1b1f2e] bg-[#090b11] relative cursor-crosshair select-none overflow-hidden"
      style={{ width: laneWidth }}
      title="Click to add automation point • Drag to adjust • Right-click or double-click point to delete"
    >
      {/* Midpoint Reference Line */}
      <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-[#1e2538] pointer-events-none" />

      {/* SVG Curve */}
      <svg width={laneWidth} height={laneHeight} className="block pointer-events-none">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={sortedPoints.length > 0 ? 0.9 : 0.3}
          strokeDasharray={sortedPoints.length > 0 ? undefined : '4 4'}
          points={polyPoints}
        />
      </svg>

      {/* Control Nodes */}
      {sortedPoints.map((pt) => {
        const left = pt.bar * zoomLevel;
        const top = (1 - pt.value) * laneHeight;
        return (
          <div
            key={pt.id}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (e.button === 2) return;
              setDraggingPointId(pt.id);
            }}
            onDoubleClick={(e) => handleDeletePoint(e, pt.id)}
            onContextMenu={(e) => handleDeletePoint(e, pt.id)}
            className="auto-point absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
            style={{ left, top, backgroundColor: color }}
            title={`Bar ${pt.bar.toFixed(2)} • ${Math.round(pt.value * 100)}% (Right-click/double-click to remove)`}
          />
        );
      })}

      {sortedPoints.length === 0 && (
        <span className="absolute left-3 top-2 text-[10px] font-mono text-gray-500 pointer-events-none flex items-center gap-1">
          <Plus className="w-3 h-3" />
          Click anywhere on lane to add {paramMeta.label} automation points
        </span>
      )}
    </div>
  );
};
