// Stocker AI Types

export type VoiceStatus = 'idle' | 'listening' | 'speaking' | 'thinking' | 'paused' | 'error';

export interface RouteItem {
  product: string;
  quantity: number;
  slot: string;
  slot_spoken?: string;
}

export interface RouteState {
  routeId?: string | null;
  routeName: string | null;
  routeDate: string | null;
  totalMachines: number;
  currentMachineIndex: number;
  currentMachineName: string | null;
  currentMachineId?: string | null;
  currentItem: RouteItem | null;
  completedItems: RouteItem[];
  machines?: any[];
  completed: boolean;
}

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}
