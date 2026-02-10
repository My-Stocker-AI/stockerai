import { useState, useCallback, useEffect, useRef } from 'react';
import {
  validateWorkflowOutput,
  validateStateUpdate,
  logValidationResult,
} from '../utils/contractValidation';

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
  pickDirection: string | null;  // Route-level direction preference: "forward" or "reverse"
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
  pendingMachineTransition: null,
  pickDirection: null
};

// DEPRECATED: No longer used - totalItems loaded at route start
// Kept for reference/debugging. Use machines array instead.
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

  // CRITICAL FIX: Lock to prevent race conditions during machine transitions
  const machineTransitionLockRef = useRef(false);

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
    // CRITICAL FIX: Enhanced error recovery for start_machine failure
    if (result && result.error && toolName === 'start_machine') {
      machineTransitionLockRef.current = false; // Release lock
      console.log('[Session] ⚠️  start_machine FAILED - Error:', result.error);
      setRouteState(prev => {
        // Find the previous in-progress machine (before failed transition)
        const previousMachine = prev.machines.find(m => m.status === 'completed' && m.sequence === prev.currentMachineIndex - 1);

        console.log('[Session] 🔙 ROLLBACK STATE:', {
          restoring: { machineId: previousMachine?.id, machineName: previousMachine?.name },
          clearingPending: prev.pendingMachineTransition?.nextMachineName
        });

        return {
          ...prev,
          pendingMachineTransition: null,
          // Restore to previous machine if transition failed
          currentMachineId: previousMachine?.id || prev.currentMachineId,
          currentMachineName: previousMachine?.name || prev.currentMachineName
        };
      });
      return;
    }

    if (!result || result.error) {
      // Generic error - release lock if held
      if (machineTransitionLockRef.current) {
        machineTransitionLockRef.current = false;
        console.log('[Session] Error in updateFromTool - released transition lock');
      }
      return;
    }

    // ============================================================================
    // CONTRACT VALIDATION - Workflow → Frontend Boundary
    // ============================================================================
    // Validate workflow output matches contract BEFORE applying to state
    const validation = validateWorkflowOutput(result, toolName);
    if (!validation.valid) {
      logValidationResult(`Workflow ${toolName} output`, validation);
      // Continue with warnings, but log violations
      // In production, we might want to reject invalid outputs
    }

    setRouteState(prev => {
      // CRITICAL FIX: Lookup totalItems INSIDE callback to avoid stale closure
      // (updateFromTool has empty deps [] so routeState is stale - must use 'prev')
      const getMachineTotalItems = (machineId: string): number => {
        const machine = prev.machines.find(m => m.id === machineId);
        if (!machine) {
          console.warn('[Session] ❌ Machine not found in state:', machineId);
          console.warn('[Session] Available machines:', prev.machines.map(m => ({ id: m.id, name: m.name, totalItems: m.totalItems })));
          return 0;
        }
        console.log('[Session] ✓ Found machine:', machine.name, 'totalItems:', machine.totalItems);
        return machine.totalItems;
      };
      const next = { ...prev };

      if (toolName === 'set_route_sequence') {
        next.routeName = result.route_name || result.route || null;
        next.routeId = result.route_id || null;
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
          // Fix: Set initial machine total from first machine
          if (next.machines.length > 0) {
            next.currentMachineTotalItems = next.machines[0].totalItems;
          }
        }
      }

      if (toolName === 'start_machine') {
        // Set machine item counts (lookup from current state, not stale closure)
        const totalItems = getMachineTotalItems(result.machine_id);
        next.currentMachineTotalItems = totalItems;
        next.currentMachineItemsRemaining = result.items_remaining || 0;

        // Fix: Update current machine identity from API response
        next.currentMachineId = result.machine_id || prev.currentMachineId;
        next.currentMachineName = result.machine_name || prev.currentMachineName;

        // Fix: Mark machine as in_progress in machines array
        if (result.machine_id) {
          next.machines = prev.machines.map(m =>
            m.id === result.machine_id
              ? { ...m, status: 'in_progress' as const }
              : m
          );
        }

        console.log('[Session] start_machine - Total:', totalItems, 'Remaining:', result.items_remaining, 'Machine:', next.currentMachineName);

        // Handle 2-pick mode: item1 and optionally item2
        const itemData = result.item1 || result;
        next.currentItem = {
          product: formatProductDisplay(itemData),
          quantity: itemData.quantity || 0,
          slot: itemData.slot || '',
          slot_spoken: itemData.slot_spoken || itemData.slot || '',
          inventory_current: itemData.inventory_current || result.inventory_current,
          inventory_parlevel: itemData.inventory_parlevel || result.inventory_parlevel,
          machineName: result.machine_name || prev.currentMachineName || '',
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
            machineName: result.machine_name || prev.currentMachineName || ''
          };
        } else {
          next.currentItem2 = null;
        }

        // CRITICAL FIX: Clear pending direction flag after starting machine
        next.pendingMachineTransition = null;
        machineTransitionLockRef.current = false; // Release transition lock

        // Store route-level direction preference (returned from workflow as "forward" or "reverse")
        if (result.direction) {
          next.pickDirection = result.direction;
          console.log('[Session] 📍 Direction saved:', result.direction);
        }

        console.log('[Session] ✅ DIRECTION ANSWERED - Lock released | Machine:', prev.currentMachineName, '| Item:', next.currentItem?.product);
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

          // DIAGNOSTIC: Log what we're trying to add
          console.log('[Session] 📝 Completing items:', {
            action,
            itemsToAdd: itemsToAdd.map(i => ({ slot: i.slot, machine: i.machineName, product: i.product })),
            prevCompletedCount: prev.completedItems.length,
            currentMachine: prev.currentMachineName
          });

          if (itemsToAdd.length === 0) {
            console.warn('[Session] ⚠️  No items to add!', {
              hasCurrentItem: !!prev.currentItem,
              currentItemSlot: prev.currentItem?.slot,
              hasCurrentItem2: !!prev.currentItem2,
              currentItem2Slot: prev.currentItem2?.slot
            });
          }

          if (itemsToAdd.length > 0) {
            // CATASTROPHIC FAILURE FIX: Deduplicate items to prevent duplicate logging
            // Check if items are already in the completed list by BOTH slot AND machine name
            const existingKeys = new Set(prev.completedItems.map(item => `${item.machineName}:${item.slot}`));
            const newItems = itemsToAdd.filter(item => !existingKeys.has(`${item.machineName}:${item.slot}`));

            console.log('[Session] 🔍 Deduplication check:', {
              itemsToAdd: itemsToAdd.length,
              newItems: newItems.length,
              filtered: itemsToAdd.length - newItems.length,
              existingKeys: Array.from(existingKeys)
            });

            if (newItems.length > 0) {
              const currentMachine = prev.machines.find(m => m.id === prev.currentMachineId);
              const oldCount = currentMachine?.completedItems || 0;

              next.completedItems = [...prev.completedItems, ...newItems];

              // EDGE CASE 3 FIX: Use workflow's items_to_increment instead of newItems.length
              // Workflow increments database by items_to_increment (based on count param)
              // Frontend MUST use same value to stay in sync
              // Using newItems.length (deduplicated) can cause divergence on retries
              // CRITICAL: Use !== undefined check (not ||) to allow items_to_increment=0
              const workflowIncrement = result.items_to_increment !== undefined
                ? result.items_to_increment
                : newItems.length;

              // Update machine's completedItems count
              if (prev.currentMachineId) {
                next.machines = prev.machines.map(m =>
                  m.id === prev.currentMachineId
                    ? { ...m, completedItems: m.completedItems + workflowIncrement }
                    : m
                );

                console.log('[Session] ✅ Updated counts:', {
                  machine: prev.currentMachineName,
                  oldCount,
                  workflowIncrement,
                  deduplicatedCount: newItems.length,
                  newCount: oldCount + workflowIncrement,
                  totalCompleted: prev.completedItems.length + newItems.length,
                  usingWorkflowValue: result.items_to_increment !== undefined
                });
              } else {
                console.warn('[Session] ⚠️  No currentMachineId - count not updated!');
              }
            } else {
              console.warn('[Session] ⚠️  All items filtered as duplicates:', itemsToAdd.map(i => `${i.machineName}:${i.slot}`));
              // Fix: Still update machine completedItems count from backend increment
              const workflowIncrement = result.items_to_increment !== undefined
                ? result.items_to_increment : 0;
              if (workflowIncrement > 0 && prev.currentMachineId) {
                next.machines = (next.machines || prev.machines).map(m =>
                  m.id === prev.currentMachineId
                    ? { ...m, completedItems: m.completedItems + workflowIncrement }
                    : m
                );
                console.log('[Session] Updated machine count despite dedup filter:', workflowIncrement);
              }
            }
          }
        }

        if (action === 'next_item') {
          // Update items remaining
          next.currentMachineItemsRemaining = result.items_remaining || 0;
          console.log('[Session] next_item - Remaining:', result.items_remaining);

          // FIX: Atomic machine state sync - update ID and name together
          const machineId = result.machine_id || prev.currentMachineId || '';
          const machineName = result.machine_name || prev.currentMachineName || '';

          // Validation: Warn if workflow returned one but not the other
          if ((result.machine_id && !result.machine_name) || (!result.machine_id && result.machine_name)) {
            console.warn('[Session] Partial machine data from workflow:', {
              has_id: !!result.machine_id,
              has_name: !!result.machine_name
            });
          }

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
          // ATOMIC UPDATE: Set both machine ID and name together
          next.currentMachineId = machineId;
          next.currentMachineName = machineName;
        } else if (action === 'next_machine') {
          // CRITICAL FIX: Check if transition already in progress (prevent race condition)
          if (machineTransitionLockRef.current) {
            console.warn('[Session] ❌ RACE CONDITION BLOCKED - Machine transition already in progress - ignoring duplicate');
            return prev; // Return unchanged state
          }

          // Set lock BEFORE making any state changes
          machineTransitionLockRef.current = true;
          console.log('[Session] 🔒 LOCK ACQUIRED - Machine transition starting');

          // Mark previous machine as completed
          if (prev.currentMachineId) {
            next.machines = prev.machines.map(m =>
              m.id === prev.currentMachineId
                ? { ...m, status: 'completed' as const, completedItems: m.totalItems }
                : m
            );
          }

          // REVERT TO WORKING BEHAVIOR: Update machine ID immediately
          next.currentMachineIndex = (prev.currentMachineIndex || 0) + 1;
          next.currentMachineName = result.next_machine || '';
          next.currentMachineId = result.next_machine_id || null;
          next.currentItem = null;
          next.currentItem2 = null;

          console.log('[Session] 🔄 MACHINE TRANSITION STATE UPDATE:', {
            from: { machineId: prev.currentMachineId, machineName: prev.currentMachineName },
            to: { machineId: result.next_machine_id, machineName: result.next_machine },
            newIndex: next.currentMachineIndex
          });

          // Mark next machine as in_progress
          if (result.next_machine_id) {
            next.machines = next.machines.map(m =>
              m.id === result.next_machine_id
                ? { ...m, status: 'in_progress' as const }
                : m
            );
          }

          // CRITICAL FIX: Set pending direction flag for AI context
          next.pendingMachineTransition = {
            nextMachineId: result.next_machine_id || '',
            nextMachineName: result.next_machine || '',
            nextMachineIndex: (prev.currentMachineIndex || 0) + 1
          };
          console.log('[Session] ⏸️  AWAITING DIRECTION for:', result.next_machine, '| pendingMachineTransition:', next.pendingMachineTransition);
        } else if (action === 'route_complete' || action === 'complete') {
          // Release transition lock on route completion
          machineTransitionLockRef.current = false;

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
          next.pendingMachineTransition = null;

          // CATASTROPHIC FAILURE FIX: Invalidate session to prevent further commands
          next.sessionInvalidated = true;
          console.log('[Session] Route complete - session invalidated, ignoring future commands');
        }
      }

      if (toolName === 'skip_current_machine') {
        // Release transition lock if skip called during transition
        if (machineTransitionLockRef.current) {
          machineTransitionLockRef.current = false;
          console.log('[Session] Skip called during transition - released lock');
        }

        // Mark current machine as skipped
        if (prev.currentMachineId) {
          const currentMachine = prev.machines.find(m => m.id === prev.currentMachineId);
          next.machines = prev.machines.map(m =>
            m.id === prev.currentMachineId
              ? { ...m, status: 'skipped' as const, skippedAtItem: currentMachine?.completedItems || 0 }
              : m
          );
        }

        // FIX: Handle machine transition consistently with get_next_item
        // Check for action field (added in workflow fix)
        const action = result.action || '';

        if (action === 'next_machine' && result.next_machine_id) {
          // Set pending transition - wait for user direction (same as get_next_item)
          next.pendingMachineTransition = {
            nextMachineId: result.next_machine_id,
            nextMachineName: result.next_machine || '',
            nextMachineIndex: (prev.currentMachineIndex || 0) + 1
          };
          // Fix: Update currentMachineId to next machine so server persistence
          // doesn't overwrite the backend's session update with the stale machine id
          next.currentMachineId = result.next_machine_id;
          next.currentMachineName = result.next_machine || '';
          next.currentMachineIndex = (prev.currentMachineIndex || 0) + 1;
          next.currentItem = null;
          next.currentItem2 = null;

          console.log('[Session] Skip set pending transition:', next.pendingMachineTransition, 'currentMachineId:', next.currentMachineId);
        } else if (action === 'route_complete') {
          // No more machines - route is done
          next.currentMachineIndex = (prev.currentMachineIndex || 0) + 1;
          next.currentItem = null;
          next.currentItem2 = null;
          next.pendingMachineTransition = null;
        } else {
          // Legacy fallback (if workflow not updated yet)
          next.currentMachineIndex = (prev.currentMachineIndex || 0) + 1;
          next.currentMachineName = result.next_machine || '';
          next.currentMachineId = result.next_machine_id || null;
          next.currentItem = null;
          next.currentItem2 = null;
          next.pendingMachineTransition = null;
          if (result.next_machine_id) {
            next.machines = next.machines.map(m =>
              m.id === result.next_machine_id
                ? { ...m, status: 'in_progress' as const }
                : m
            );
          }
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

      // ============================================================================
      // CONTRACT VALIDATION - Frontend State Update
      // ============================================================================
      // Validate state transition maintains contracts
      const stateValidation = validateStateUpdate(prev, next);
      if (!stateValidation.valid) {
        logValidationResult('Frontend state update', stateValidation);
        // Log violations but allow state update (with warnings)
        // In production, we might want to block invalid transitions
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
