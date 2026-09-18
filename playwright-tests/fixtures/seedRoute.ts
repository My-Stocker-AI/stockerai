/**
 * SEEDING — creates a throwaway route in the database and removes it afterwards.
 *
 * The pure half (what the route contains) lives in routePlan.ts and is unit tested.
 * This half does the writing, using the service-role key so it bypasses row-level security.
 *
 * SAFETY RULE, non-negotiable: this file only ever deletes rows it can prove it created.
 * Every delete path is gated on isFixtureRouteName(). Real routes — Davy's, Russ's, anyone's —
 * are untouchable by anything in here.
 */

import { testDatabase } from './testSafety';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildRoutePlan,
  isFixtureRouteName,
  FIXTURE_SPOKEN_HANDLE,
  type RoutePlanOptions,
} from './routePlan';

export interface SeededMachine {
  id: string;
  sequence: number;
  machine_name: string;
}

export interface SeededItem {
  id: string;
  machine_id: string;
  sequence: number;
  product_name: string;
  quantity: number;
  slot: string;
}

export interface SeededRoute {
  routeId: string;
  routeName: string;
  /** What a test says out loud to start this route: `start ${spokenName} route`. */
  spokenName: string;
  runId: string;
  deliveryDate: string;
  machines: SeededMachine[];
  items: SeededItem[];
  /** Items belonging to one machine, in pick order. */
  itemsForMachine(sequence: number): SeededItem[];
}

let cachedClient: SupabaseClient | null = null;
const createdRoutes = new Set<string>();

/** Service-role client. Tests only — this key must never reach the browser bundle. */
export function adminClient(): SupabaseClient {
  const { url, key } = testDatabase();
  if (cachedClient) return cachedClient;

  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

/** Today as YYYY-MM-DD in local time — routes are filed by calendar day, not by instant. */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type SeedOptions = Omit<RoutePlanOptions, 'userId' | 'deliveryDate'> & {
  userId?: string;
  deliveryDate?: string;
};

/**
 * Creates the route, its machines, and its items. Returns the real ids so a test can drive the
 * app straight at a known machine or item instead of hunting for one in the UI.
 */
export async function seedRoute(options: SeedOptions): Promise<SeededRoute> {
  const userId = options.userId || process.env.STOCKERAI_TEST_USER_ID;
  if (!userId) {
    throw new Error('Test seeding needs a disposable local STOCKERAI_TEST_USER_ID');
  }

  const plan = buildRoutePlan({
    ...options,
    userId,
    deliveryDate: options.deliveryDate || todayIso(),
  });

  const db = adminClient();

  const { data: routeRows, error: routeError } = await db
    .from('routes')
    .insert(plan.route)
    .select('id')
    .limit(1);

  if (routeError || !routeRows?.[0]) {
    throw new Error(`Seeding failed creating the route: ${routeError?.message || 'no row returned'}`);
  }
  const routeId = routeRows[0].id as string;
  createdRoutes.add(routeId);

  const { data: machineRows, error: machineError } = await db
    .from('machines')
    .insert(plan.machines.map((m) => ({ ...m, route_id: routeId })))
    .select('id, sequence, machine_name');

  if (machineError || !machineRows?.length) {
    await destroyRoute(routeId); // never leave a half-built route behind
    throw new Error(`Seeding failed creating machines: ${machineError?.message || 'no rows returned'}`);
  }

  const machineIdBySequence = new Map<number, string>(
    machineRows.map((m) => [m.sequence as number, m.id as string]),
  );

  const itemRows = plan.items.map(({ machineSequence, ...item }) => ({
    ...item,
    machine_id: machineIdBySequence.get(machineSequence)!,
  }));

  const { data: insertedItems, error: itemError } = await db
    .from('items')
    .insert(itemRows)
    .select('id, machine_id, sequence, product_name, quantity, slot');

  if (itemError || !insertedItems?.length) {
    await destroyRoute(routeId);
    throw new Error(`Seeding failed creating items: ${itemError?.message || 'no rows returned'}`);
  }

  const machines: SeededMachine[] = machineRows
    .map((m) => ({
      id: m.id as string,
      sequence: m.sequence as number,
      machine_name: m.machine_name as string,
    }))
    .sort((a, b) => a.sequence - b.sequence);

  const items: SeededItem[] = (insertedItems as SeededItem[])
    .slice()
    .sort((a, b) => a.sequence - b.sequence);

  return {
    routeId,
    routeName: plan.routeName,
    spokenName: FIXTURE_SPOKEN_HANDLE,
    runId: options.runId,
    deliveryDate: plan.route.delivery_date,
    machines,
    items,
    itemsForMachine(sequence: number) {
      const machineId = machineIdBySequence.get(sequence);
      return items.filter((i) => i.machine_id === machineId).sort((a, b) => a.sequence - b.sequence);
    },
  };
}

/**
 * Removes a fixture route and everything hanging off it.
 * Refuses outright if the route isn't one of ours.
 */
export async function destroyRoute(routeId: string): Promise<void> {
  if (!createdRoutes.has(routeId)) throw new Error('Refusing cleanup of a route not created by this worker');
  const db = adminClient();

  const { data: routes } = await db.from('routes').select('id, route_name').eq('id', routeId).limit(1).throwOnError();
  const route = routes?.[0];
  if (!route) { createdRoutes.delete(routeId); return; }

  if (!isFixtureRouteName(route.route_name as string)) {
    throw new Error(
      `Refusing to delete "${route.route_name}" — teardown only ever removes routes it created.`,
    );
  }

  const { data: machines } = await db.from('machines').select('id').eq('route_id', routeId).throwOnError();
  const machineIds = (machines || []).map((m) => m.id as string);

  if (machineIds.length) {
    await db.from('items').delete().in('machine_id', machineIds).throwOnError();
  }
  // A session pointing at a deleted route is what makes the NEXT run resume into nothing.
  await db.from('sessions').delete().eq('current_route_id', routeId).throwOnError();
  await db.from('machines').delete().eq('route_id', routeId).throwOnError();
  await db.from('routes').delete().eq('id', routeId).throwOnError();
  createdRoutes.delete(routeId);
}
