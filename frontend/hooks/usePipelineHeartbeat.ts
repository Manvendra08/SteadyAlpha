'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';

export function usePipelineHeartbeat() {
  const [activeRun, setActiveRun] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    // 1. Initial check for any 'running' status in 'runs' table
    const checkInitial = async () => {
      const { data } = await supabase
        .from('runs')
        .select('*')
        .eq('status', 'running')
        .order('timestamp', { ascending: false })
        .limit(1);
      
      if (data && data.length > 0) {
        setActiveRun(data[0]);
      }
    };

    checkInitial();

    // 2. Subscribe to REALTIME changes on 'runs' table
    const channel = supabase
      .channel('pipeline-heartbeat')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'runs' },
        (payload) => {
          const run = payload.new as any;
          
          if (run.status === 'running') {
            setActiveRun(run);
          } else {
            // Run finished (success or failed)
            setActiveRun(null);
            // Refresh the server component data
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return {
    isRunning: !!activeRun,
    activeRunId: activeRun?.id,
    activeRunTs: activeRun?.timestamp,
  };
}
