import { useState, useEffect, useMemo } from 'react';
import type { FastenerPoint } from '../types';

export interface FeedControls {
  revealed:    FastenerPoint[];
  isRunning:   boolean;
  isComplete:  boolean;
  speed:       number;
  start:       () => void;
  pause:       () => void;
  reset:       () => void;
  setSpeed:    (ms: number) => void;
  completeAll: () => void;
}

export function useFastenerFeed(points: FastenerPoint[]): FeedControls {
  const [index, setIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeedState] = useState(800);

  useEffect(() => {
    if (!isRunning || index >= points.length) return;
    const id = setInterval(() => setIndex((i) => i + 1), speed);
    return () => clearInterval(id);
  }, [isRunning, speed, index, points.length]);

  const revealed = useMemo(() => points.slice(0, index), [points, index]);
  const isComplete = index >= points.length && points.length > 0;

  return {
    revealed,
    isRunning,
    isComplete,
    speed,
    start:    () => setIsRunning(true),
    pause:    () => setIsRunning(false),
    reset:       () => { setIndex(0); setIsRunning(false); },
    setSpeed:    (ms: number) => setSpeedState(Math.min(3000, Math.max(5, ms))),
    completeAll: () => { setIsRunning(false); setIndex(points.length); },
  };
}
