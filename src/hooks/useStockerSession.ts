import { useState, useCallback, useEffect, useRef } from 'react';

export interface CurrentItem {
  product: string;
  quantity: number;
  slot: string;
  slot_spoken: string;
  inventory_current?: number;
  inventory_parlevel?: number;
  machineName?: string;  // Track which machine this item came from
  items_remaining?: number;  // How many items left on this machine
  item_index?: number;  // Current item's sequence position
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
  currentMachineTotalItems: number;  // Total items on current machine (from DB)
  currentMachineItemsRemaining: number;  // Remaining items (from workflow)
  currentItem: CurrentItem | null;
  currentItem2: CurrentItem | null;  // Second item in 2-pick mode
  completedItems: CurrentItem[];
  machines: MachineState[];
  completed: boolean;
  sessionInvalidated?: boolean;  // CATASTROPHIC FAILURE FIX: Prevents commands after route complete
  pendingMachineTransition: {  // Tracks machine awaiting direction response
    nextMachineId: string;
    nextMachineName: string;
    nextMachineIndex: number;
  } | null;
}

const INITIAL_STATE: RouteState = {
  routeId: null,
  routeName: null,
  routeDate: null,
  totalMachines: 0,
  currentMachineIndex: 0,
  currentMachineName: null,
  currentMachineId: null,
  currentMachineTotalItems: 0,
  currentMachineItemsRemaining: 0,
  currentItem: null,
  currentItem2: null,
  completedItems: [],
  machines: [],
  completed: false,
  pendingMachineTransition: null
};

// Helper: Fetch machine's total_items from database
async function fetchMachineTotalItems(machineId: string): Promise<number> {
  try {
    console.log('[Session] fetchMachineTotalItems called with:', machineId);
    const { supabase } = await import('@/integrations/supabase/client');

    const { data, error } = await supabase
      .from('machines')
      .select('total_items')
      .eq('id', machineId)
      .single();

    if (error) {
      console.error('[Session] Failed to fetch machine total_items:', error);
      return 0;
    }

    console.log('[Session] Database returned total_items:', data?.total_items);
    return data?.total_items || 0;
  } catch (err) {
    console.error('[Session] Error fetching machine total_items:', err);
    return 0;
  }
}

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

  // Helper to format product display from parsed data
  const formatProductDisplay = (itemData: any): string => {
    // If product_parsed exists, use formatted version
    if (itemData.product_parsed?.name) {
      const parts = [itemData.product_parsed.name];
      if (itemData.product_parsed.size) {
        parts.push(`(${itemData.product_parsed.size})`);
      }
      return parts.join(' ');
    }
    // Fallback to raw product_name
    return itemData.product || itemData.product_name || '';
  };

  const updateFromTool = useCallback(async (toolName: string, result: any) => {
    if (!result || result.error) return;

    // Fetch machine total_items when starting or switching machines
    let machineTotalItems = 0;
    if (toolName === 'start_machine' && result.machine_id) {
      console.log('[Session] Fetching total_items for machine_id:', result.machine_id);
      machineTotalItems = await fetchMachineTotalItems(result.machine_id);
      console.log('[Session] fetchMachineTotalItems returned:', machineTotalItems);
    } else if (toolName === 'start_machine') {
      console.log('[Session] start_machine called but no machine_id in result:', result);
    }

    if (toolName === 'get_next_item' && result.action === 'next_machine' && result.next_machine_id) {
      machineTotalItems = await fetchMachineTotalItems(result.next_machine_id);
    }

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
        next.currentItem2 = null;
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
        // Set machine item counts
        next.currentMachineTotalItems = machineTotalItems;
        next.currentMachineItemsRemaining = result.items_remaining || 0;
        console.log('[Session] start_machine - Total:', machineTotalItems, 'Remaining:', result.items_remaining);

        // Handle 2-pick mode: item1 and optionally item2
        const itemData = result.item1 || result;
        next.currentItem = {
          product: formatProductDisplay(itemData),
          quantity: itemData.quantity || 0,
          slot: itemData.slot || '',
          slot_spoken: itemData.slot_spoken || itemData.slot || '',
          inventory_current: itemData.inventory_current || result.inventory_current,
          inventory_parlevel: itemData.inventory_parlevel || result.inventory_parlevel,
          machineName: prev.currentMachineName || '',
          items_remaining: result.items_remaining,
          item_index: result.new_item_index
        };

        // 2-pick mode: Set second item if present
        if (result.item2) {
          next.currentItem2 = {
            product: formatProductDisplay(result.item2),
            quantity: result.item2.quantity || 0,
            slot: result.item2.slot || '',
            slot_spoken: result.item2.slot_spoken || result.item2.slot || '',
            inventory_current: result.item2.inventory_current,
            inventory_parlevel: result.item2.inventory_parlevel,
            machineName: prev.currentMachineName || ''
          };
        } else {
          next.currentItem2 = null;
        }
      }

      if (toolName === 'get_next_item') {
        const action = result.action || '';

        if (action === 'next_item' || action === 'next_machine' || action === 'route_complete' || action === 'complete') {
          // Add current item(s) to completed list (2-pick mode: add both if present)
          const itemsToAdd: CurrentItem[] = [];
          if (prev.currentItem && prev.currentItem.slot) {
            itemsToAdd.push(prev.currentItem);
          }
          if (prev.currentItem2 && prev.currentItem2.slot) {
            itemsToAdd.push(prev.currentItem2);
          }

          if (itemsToAdd.length > 0) {
            // CATASTROPHIC FAILURE FIX: Deduplicate items to prevent duplicate logging
            // Check if items are already in the completed list by slot ID
            const existingSlots = new Set(prev.completedItems.map(item => item.slot));
            const newItems = itemsToAdd.filter(item => !existingSlots.has(item.slot));

            if (newItems.length > 0) {
              next.completedItems = [...prev.completedItems, ...newItems];

              // Update machine's completedItems count (only for genuinely new items)
              if (prev.currentMachineId) {
                next.machines = prev.machines.map(m =>
                  m.id === prev.currentMachineId
                    ? { ...m, completedItems: m.completedItems + newItems.length }
                    : m
                );
              }
            } else {
              console.warn('[Session] Attempted to add duplicate items:', itemsToAdd.map(i => i.slot));
            }
          }
        }

        if (action === 'next_item') {
          // Update items remaining
          next.currentMachineItemsRemaining = result.items_remaining || 0;
          console.log('[Session] next_item - Remaining:', result.items_remaining);

          const machineName = result.machine_name || prev.currentMachineName || '';
          // Handle 2-pick mode: item1 and optionally item2
          const itemData = result.item1 || result;
          next.currentItem = {
            product: formatProductDisplay(itemData),
            quantity: itemData.quantity || 0,
            slot: itemData.slot || '',
            slot_spoken: itemData.slot_spoken || itemData.slot || '',
            inventory_current: itemData.inventory_current || result.inventory_current,
            inventory_parlevel: itemData.inventory_parlevel || result.inventory_parlevel,
            machineName: machineName,
            items_remaining: result.items_remaining,
            item_index: result.new_item_index
          };

          // 2-pick mode: Set second item if present
          if (result.item2) {
            next.currentItem2 = {
              product: formatProductDisplay(result.item2),
              quantity: result.item2.quantity || 0,
              slot: result.item2.slot || '',
              slot_spoken: result.item2.slot_spoken || result.item2.slot || '',
              inventory_current: result.item2.inventory_current,
              inventory_parlevel: result.item2.inventory_parlevel,
              machineName: machineName
            };
          } else {
            next.currentItem2 = null;
          }

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

          // REVERT TO WORKING BEHAVIOR: Update machine ID immediately
          next.currentMachineIndex = (prev.currentMachineIndex || 0) + 1;
          next.currentMachineName = result.next_machine || '';
          next.currentMachineId = result.next_machine_id || null;
          next.currentItem = null;
          next.currentItem2 = null;

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
            // CRITICAL FIX: Use next.machines (not prev.machines) to preserve counter update from line 242
            next.machines = next.machines.map(m =>
              m.id === prev.currentMachineId
                ? { ...m, status: 'completed' as const }
                : m
            );
          }
          next.currentItem = null;
          next.currentItem2 = null;
          next.completed = true;

          // CATASTROPHIC FAILURE FIX: Invalidate session to prevent further commands
          next.sessionInvalidated = true;
          console.log('[Session] Route complete - session invalidated, ignoring future commands');
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
        next.currentItem2 = null;
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
