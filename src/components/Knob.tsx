import React, { useRef, useState, useEffect } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  onChange: (value: number) => void;
}

export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue = (min + max) / 2,
  unit = '',
  size = 'md',
  color = '#a855f7',
  onChange
}) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const startValueRef = useRef<number>(value);

  const sizePixels = size === 'sm' ? 36 : size === 'lg' ? 56 : 44;

  // Normalized 0 to 1
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Angle: -135deg to +135deg (total 270 deg)
  const angle = -135 + normalized * 270;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startYRef.current - e.clientY;
      const sensitivity = 0.005;
      const deltaNormalized = deltaY * sensitivity;
      const initialNormalized = (startValueRef.current - min) / (max - min);
      const newNormalized = Math.max(0, Math.min(1, initialNormalized + deltaNormalized));
      const rawValue = min + newNormalized * (max - min);
      const steppedValue = Math.round(rawValue / step) * step;
      onChange(Number(steppedValue.toFixed(2)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, step, onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValueRef.current = value;
  };

  const handleDoubleClick = () => {
    onChange(defaultValue);
  };

  return (
    <div className="flex flex-col items-center select-none group">
      <div
        ref={knobRef}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className="relative cursor-ns-resize flex items-center justify-center rounded-full bg-[#161922] border-2 border-[#2b3042] shadow-inner transition-shadow hover:border-[#4d5675]"
        style={{ width: sizePixels, height: sizePixels }}
        title={`${label}: ${value}${unit} (Drag up/down, double-click to reset)`}
      >
        {/* Subtle rotary tick mark */}
        <div
          className="absolute w-1 h-3 rounded-full transition-transform"
          style={{
            backgroundColor: color,
            transform: `rotate(${angle}deg) translateY(-${sizePixels * 0.28}px)`,
            boxShadow: `0 0 6px ${color}`
          }}
        />

        {/* Center core */}
        <div
          className="rounded-full bg-[#0d0f14] flex items-center justify-center border border-[#1f2330]"
          style={{ width: sizePixels * 0.52, height: sizePixels * 0.52 }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        </div>
      </div>

      <div className="text-[10px] uppercase font-bold text-gray-400 mt-1 tracking-wider text-center">
        {label}
      </div>
      <div className="text-[9px] font-mono text-gray-500 font-semibold">
        {value}
        {unit}
      </div>
    </div>
  );
};
