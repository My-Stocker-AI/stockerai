import { useState, useCallback, useEffect, useRef } from 'react';

export interface CurrentItem {
  product: string;
  quantity: number;
  slot: string;
  slot_spoken: string;
  inventory_current?: number;
  inventory_parlevel?: number;
  machineName?: string;  // Track which machine this item came from
}

export type MachineStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface MachineState {
  id: string;
  name: string;
  location: string;
  sequence: number;
  totalItems: number;
  completedItems: number;
  status: MachineStatus;
  skippedAtItem?: number;  // If skipped mid-machine, track position
}

export interface RouteState {
  routeId: string | null;
  routeName: string | null;
  routeDate: string | null;
  totalMachines: number;
  currentMachineIndex: number;
  currentMachineName: string | null;
  currentMachineId: string | null;
  currentItem: CurrentItem | null;
  completedItems: CurrentItem[];
  machines: MachineState[];
  completed: boolean;
}

const INITIAL_STATE: RouteState = {
  routeId: null,
  routeName: null,
  routeDate: null,
  totalMachines: 0,
  currentMachineIndex: 0,
  currentMachineName: null,
  currentMachineId: null,
  currentItem: null,
  completedItems: [],
  machines: [],
  completed: false
};

export function useStockerSession(userId: string | null) {
  const [routeState, setRouteState] = useState<RouteState>(INITIAL_STATE);
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<any[]>([]);

  // Ref to avoid stale closures - always has latest messages
  const messagesRef = useRef<any[]>([]);

  // Generate a new session ID (called explicitly, not on mount)
  const generateNewSessionId = useCallback(() => {
    const newId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newId);
    return newId;
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
        next.currentMachineId = result.machine_id || null;
        next.currentItem = null;
        next.completedItems = [];
        next.completed = false;
        // Store machines list from workflow
        if (result.machines && Array.isArray(result.machines)) {
          next.machines = result.machines.map((m: any) => ({
            id: m.id,
            name: m.name,
            location: m.location,
            sequence: m.sequence,
            totalItems: m.totalItems || 0,
            completedItems: m.completedItems || 0,
            status: m.status || 'pending'
          }));
        }
      }

      if (toolName === 'start_machine') {
        // Handle 2-pick mode: if item1 exists, use it (item2 is handled separately in UI via lastItemPair)
        const itemData = result.item1 || result;
        next.currentItem = {
          product: itemData.product || itemData.product_name || '',
          quantity: itemData.quantity || 0,
          slot: itemData.slot || '',
          slot_spoken: itemData.slot_spoken || itemData.slot || '',
          inventory_current: itemData.inventory_current || result.inventory_current,
          inventory_parlevel: itemData.inventory_parlevel || result.inventory_parlevel,
          machineName: prev.currentMachineName || ''
        };
      }

      if (toolName === 'get_next_item') {
        const action = result.action || '';

        if (action === 'next_item' || action === 'next_machine' || action === 'route_complete') {
          // Add current item to completed list if it exists
          if (prev.currentItem && prev.currentItem.slot) {
            next.completedItems = [...prev.completedItems, prev.currentItem];
            // Update machine's completedItems count
            if (prev.currentMachineId) {
              next.machines = prev.machines.map(m =>
                m.id === prev.currentMachineId
                  ? { ...m, completedItems: m.completedItems + 1 }
                  : m
              );
            }
          }
        }

        if (action === 'next_item') {
          const machineName = result.machine_name || prev.currentMachineName || '';
          // Handle 2-pick mode: if item1 exists, use it (item2 is handled separately in UI via lastItemPair)
          const itemData = result.item1 || result;
          next.currentItem = {
            product: itemData.product || itemData.product_name || '',
            quantity: itemData.quantity || 0,
            slot: itemData.slot || '',
            slot_spoken: itemData.slot_spoken || itemData.slot || '',
            inventory_current: itemData.inventory_current || result.inventory_current,
            inventory_parlevel: itemData.inventory_parlevel || result.inventory_parlevel,
            machineName: machineName
          };
          next.currentMachineIndex = result.machine_index || prev.currentMachineIndex;
          next.currentMachineName = machineName;
        } else if (action === 'next_machine') {
          // Mark previous machine as completed
          if (prev.currentMachineId) {
            next.machines = prev.machines.map(m =>
              m.id === prev.currentMachineId
                ? { ...m, status: 'completed' as const }
                : m
            );
          }
          next.currentMachineIndex = (prev.currentMachineIndex || 0) + 1;
          next.currentMachineName = result.next_machine || '';
          next.currentMachineId = result.next_machine_id || null;
          next.currentItem = null;
          // Mark next machine as in_progress
          if (result.next_machine_id) {
            next.machines = next.machines.map(m =>
              m.id === result.next_machine_id
                ? { ...m, status: 'in_progress' as const }
                : m
            );
          }
        } else if (action === 'route_complete' || action === 'complete') {
          // Mark last machine as completed
          if (prev.currentMachineId) {
            next.machines = prev.machines.map(m =>
              m.id === prev.currentMachineId
                ? { ...m, status: 'completed' as const }
                : m
            );
          }
          next.currentItem = null;
          next.completed = true;
        }
      }

      if (toolName === 'skip_current_machine') {
        // Mark current machine as skipped
        if (prev.currentMachineId) {
          const currentMachine = prev.machines.find(m => m.id === prev.currentMachineId);
          next.machines = prev.machines.map(m =>
            m.id === prev.currentMachineId
              ? { ...m, status: 'skipped' as const, skippedAtItem: currentMachine?.completedItems || 0 }
              : m
          );
        }
        next.currentMachineIndex = (prev.currentMachineIndex || 0) + 1;
        next.currentMachineName = result.next_machine || '';
        next.currentMachineId = result.next_machine_id || null;
        next.currentItem = null;
        // Mark next machine as in_progress
        if (result.next_machine_id) {
          next.machines = next.machines.map(m =>
            m.id === result.next_machine_id
              ? { ...m, status: 'in_progress' as const }
              : m
          );
        }
      }

      if (toolName === 'go_back_to_skipped') {
        // Update the skipped machine to in_progress
        if (result.machine_id) {
          next.machines = prev.machines.map(m =>
            m.id === result.machine_id
              ? { ...m, status: 'in_progress' as const }
              : m.id === prev.currentMachineId
                ? { ...m, status: 'pending' as const } // Put current back to pending
                : m
          );
          next.currentMachineId = result.machine_id;
          next.currentMachineName = result.machine_name || '';
        }
      }

      return next;
    });
  }, []);

  const addMessage = useCallback((msg: any) => {
    // Update ref immediately (before React re-renders)
    const updated = [...messagesRef.current, msg];
    const trimmed = updated.length > 20 ? updated.slice(-20) : updated;
    messagesRef.current = trimmed;
    // Also update state for React rendering
    setMessages(trimmed);
  }, []);

  const reset = useCallback(() => {
    setRouteState(INITIAL_STATE);
    setMessages([]);
    messagesRef.current = [];
  }, []);

  return {
    routeState,
    sessionId,
    messages,
    messagesRef,  // Expose ref for stale-closure-safe access
    updateFromTool,
    addMessage,
    reset,
    setRouteState,
    setMessages,
    setSessionId,
    generateNewSessionId
  };
}
