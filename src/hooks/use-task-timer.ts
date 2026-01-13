import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseTaskTimerProps {
  taskId: string;
  initialMinutes?: number;
  onTimeUpdate?: (minutes: number) => void;
}

interface UseTaskTimerReturn {
  isRunning: boolean;
  elapsedMinutes: number;
  formattedTime: string;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
}

export function useTaskTimer({ 
  taskId, 
  initialMinutes = 0,
  onTimeUpdate 
}: UseTaskTimerProps): UseTaskTimerReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(initialMinutes * 60);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Format time as HH:MM:SS
  const formattedTime = useCallback(() => {
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [elapsedSeconds])();

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Timer tick
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  // Notify on time update every minute
  useEffect(() => {
    if (onTimeUpdate && elapsedSeconds > 0 && elapsedSeconds % 60 === 0) {
      onTimeUpdate(elapsedMinutes);
    }
  }, [elapsedSeconds, elapsedMinutes, onTimeUpdate]);

  const start = useCallback(async () => {
    const now = new Date();
    setStartTime(now);
    setIsRunning(true);

    // Update database with timer start
    try {
      await supabase
        .from('client_tasks')
        .update({ 
          timer_started_at: now.toISOString(),
          started_at: now.toISOString()
        })
        .eq('id', taskId);
    } catch (error) {
      console.error('Error starting timer:', error);
    }
  }, [taskId]);

  const pause = useCallback(async () => {
    setIsRunning(false);

    // Save accumulated time to database
    try {
      await supabase
        .from('client_tasks')
        .update({ 
          time_spent_minutes: elapsedMinutes,
          timer_started_at: null
        })
        .eq('id', taskId);
    } catch (error) {
      console.error('Error pausing timer:', error);
    }
  }, [taskId, elapsedMinutes]);

  const stop = useCallback(async () => {
    setIsRunning(false);

    // Save final time and clear timer
    try {
      await supabase
        .from('client_tasks')
        .update({ 
          time_spent_minutes: elapsedMinutes,
          timer_started_at: null
        })
        .eq('id', taskId);
      
      toast.success(`Time logged: ${formattedTime}`);
    } catch (error) {
      console.error('Error stopping timer:', error);
      toast.error('Failed to save time');
    }
  }, [taskId, elapsedMinutes, formattedTime]);

  const reset = useCallback(() => {
    setIsRunning(false);
    setElapsedSeconds(0);
    setStartTime(null);
  }, []);

  return {
    isRunning,
    elapsedMinutes,
    formattedTime,
    start,
    pause,
    stop,
    reset
  };
}
