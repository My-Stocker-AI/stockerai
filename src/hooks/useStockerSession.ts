import { useState, useCallback, useEffect, useRef } from 'react';

export interface CurrentItem {
  product: string;
  quantity: number;
  slot: string;
  slot_spoken: string;
  inventory_current?: number;
  inventory_parlevel?: number;
}

export interface RouteState {
  routeName: string | null;
  routeDate: string | null;
  totalMachines: number;
  currentMachineIndex: number;
  currentMachineName: string | null;
  currentItem: CurrentItem | null;
  completedItems: CurrentItem[];
  completed: boolean;
}

const INITIAL_STATE: RouteState = {
  routeName: null,
  routeDate: null,
  totalMachines: 0,
  currentMachineIndex: 0,
  currentMachineName: null,
  currentItem: null,
  completedItems: [],
  completed: false
};

export function useStockerSession(userId: string | null) {
  const [routeState, setRouteState] = useState<RouteState>(INITIAL_STATE);
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    setSessionId(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  }, []);

  const updateFromTool = useCallback((toolName: string, result: any) => {
    if (!result || result.error) return;

    setRouteState(prev => {
      const next = { ...prev };

      if (toolName === 'set_route_sequence') {
        next.routeName = result.route_name || result.route || null;
        next.routeDate = result.date || null;
        next.totalMachines = result.machines_count || result.total_machines || 0;
        next.currentMachineIndex = result.machine_index || 1;
        next.currentMachineName = result.machine_name || '';
        next.currentItem = null;
        next.completedItems = [];
        next.completed = false;
      }

      if (toolName === 'start_machine') {
        next.currentItem = {
          product: result.product || result.product_name || '',
          quantity: result.quantity || 0,
          slot: result.slot || '',
          slot_spoken: result.slot_spoken || result.slot || '',
          inventory_current: result.inventory_current,
          inventory_parlevel: result.inventory_parlevel
        };
      }

      if (toolName === 'get_next_item') {
        const action = result.action || '';

        if (action === 'next_item' || action === 'next_machine' || action === 'route_complete') {
          if (prev.currentItem?.product) {
            next.completedItems = [...prev.completedItems, prev.currentItem];
          }
        }

        if (action === 'next_item') {
          next.currentItem = {
            product: result.product || '',
            quantity: result.quantity || 0,
            slot: result.slot || '',
            slot_spoken: result.slot_spoken || '',
            inventory_current: result.inventory_current,
            inventory_parlevel: result.inventory_parlevel
          };
          next.currentMachineIndex = result.machine_index || prev.currentMachineIndex;
          next.currentMachineName = result.machine_name || prev.currentMachineName;
        } else if (action === 'next_machine') {
          next.currentMachineIndex = (prev.currentMachineIndex || 0) + 1;
          next.currentMachineName = result.next_machine || '';
          next.currentItem = null;
        } else if (action === 'route_complete' || action === 'complete') {
          next.currentItem = null;
          next.completed = true;
        }
      }

      return next;
    });
  }, []);

  const addMessage = useCallback((msg: any) => {
    setMessages(prev => {
      const updated = [...prev, msg];
      return updated.length > 20 ? updated.slice(-20) : updated;
    });
  }, []);

  const reset = useCallback(() => {
    setRouteState(INITIAL_STATE);
    setMessages([]);
  }, []);

  return {
    routeState,
    sessionId,
    messages,
    updateFromTool,
    addMessage,
    reset,
    setRouteState,
    setMessages,
    setSessionId
  };
}
