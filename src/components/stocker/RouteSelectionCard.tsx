import { MapPin, Package, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RouteInfo {
  route_name: string;
  route_date: string;
  machine_count: number;
  item_count: number;
  machine_names: string[];
}

interface RouteSelectionCardProps {
  route: RouteInfo;
  onSelect: (routeName: string) => void;
  isSelected?: boolean;
  isLoading?: boolean;
}

export function RouteSelectionCard({ route, onSelect, isSelected, isLoading }: RouteSelectionCardProps) {
  return (
    <button
      onClick={() => onSelect(route.route_name)}
      disabled={isLoading}
      className={cn(
        "w-full p-4 bg-[#161b22] rounded-xl border transition-all text-left",
        "hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10",
        "active:scale-[0.98]",
        isSelected
          ? "border-emerald-500 shadow-lg shadow-emerald-500/20"
          : "border-gray-700",
        isLoading && "opacity-50 cursor-wait"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-500/20 rounded-lg">
          <MapPin className="h-5 w-5 text-emerald-400" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-lg">{route.route_name}</h3>

          <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <Truck className="h-4 w-4" />
              {route.machine_count} machine{route.machine_count !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Package className="h-4 w-4" />
              {route.item_count} items
            </span>
          </div>

          {route.machine_names.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {route.machine_names.slice(0, 3).map((name, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 bg-gray-800 rounded-full text-gray-400"
                >
                  {name}
                </span>
              ))}
              {route.machine_names.length > 3 && (
                <span className="text-xs px-2 py-0.5 text-gray-500">
                  +{route.machine_names.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {isSelected && (
        <div className="mt-3 text-center text-emerald-400 text-sm font-medium animate-pulse">
          Starting...
        </div>
      )}
    </button>
  );
}
