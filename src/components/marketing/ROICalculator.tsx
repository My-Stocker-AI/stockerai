import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROICalculator = () => {
  const [drivers, setDrivers] = useState(5);
  const [hourlyWage, setHourlyWage] = useState(18);

  const calculations = useMemo(() => {
    // Monthly labor hours = drivers × 8 hours × 22 days
    const monthlyLaborHours = drivers * 8 * 22;
    // Monthly labor cost = hours × hourly wage
    const monthlyLaborCost = monthlyLaborHours * hourlyWage;
    // Estimated savings (25%) = labor cost × 0.25
    const estimatedSavings = monthlyLaborCost * 0.25;
    // Stocker cost based on tier
    let perDriverCost = 20;
    if (drivers > 20) perDriverCost = 15;
    else if (drivers > 5) perDriverCost = 18;
    const stockerCost = drivers * perDriverCost;
    // Net savings = estimated savings - Stocker cost
    const netSavings = estimatedSavings - stockerCost;

    return {
      estimatedSavings,
      stockerCost,
      netSavings,
    };
  }, [drivers, hourlyWage]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="card-base border border-border max-w-2xl mx-auto">
      <div className="space-y-8">
        {/* Inputs */}
        <div className="space-y-6">
          {/* Driver count slider */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label htmlFor="drivers" className="text-base font-medium">
                Number of drivers
              </Label>
              <span className="text-2xl font-bold text-primary">{drivers}</span>
            </div>
            <Slider
              id="drivers"
              min={2}
              max={50}
              step={1}
              value={[drivers]}
              onValueChange={(value) => setDrivers(value[0])}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>2</span>
              <span>50</span>
            </div>
          </div>

          {/* Hourly wage input */}
          <div className="space-y-2">
            <Label htmlFor="wage" className="text-base font-medium">
              Average hourly wage ($)
            </Label>
            <Input
              id="wage"
              type="number"
              min={10}
              max={50}
              value={hourlyWage}
              onChange={(e) => setHourlyWage(Number(e.target.value) || 18)}
              className="max-w-[120px]"
            />
          </div>
        </div>

        {/* Results */}
        <div className="bg-alt rounded-lg p-6 space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted-foreground">Estimated monthly labor savings</span>
            <span className="text-xl font-semibold text-foreground">
              {formatCurrency(calculations.estimatedSavings)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted-foreground">Stocker cost</span>
            <span className="text-lg text-foreground">
              {formatCurrency(calculations.stockerCost)}/mo
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-lg font-medium text-foreground">Net monthly savings</span>
            <span className="text-2xl font-bold text-primary">
              {formatCurrency(calculations.netSavings)}
            </span>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link to="/login">
            <Button className="btn-primary">Start Free Trial</Button>
          </Link>
        </div>

        {/* Footnote */}
        <p className="text-sm text-muted-foreground text-center">
          Based on industry research showing 25-35% productivity gains with voice-directed picking.
        </p>
      </div>
    </div>
  );
};

export default ROICalculator;