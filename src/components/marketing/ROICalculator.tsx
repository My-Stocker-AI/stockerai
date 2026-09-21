import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROICalculator = () => {
  const [drivers, setDrivers] = useState(5);
  const [hourlyWage, setHourlyWage] = useState(21);
  const [pickingHours, setPickingHours] = useState(1.5);
  const [reduction, setReduction] = useState(35);

  const calculations = useMemo(() => {
    // Monthly picking hours, averaged over 52 working weeks per year
    const monthlyLaborHours = drivers * pickingHours * 5 * 52 / 12;
    // Monthly labor cost = hours × hourly wage
    const monthlyLaborCost = monthlyLaborHours * hourlyWage;
    // Estimated value of picking time saved
    const estimatedSavings = monthlyLaborCost * reduction / 100;
    // Stocker AI cost based on tier
    let perDriverCost = 20;
    if (drivers > 20) perDriverCost = 15;
    else if (drivers > 5) perDriverCost = 18;
    const stockerCost = drivers * perDriverCost;
    // Net savings = estimated savings - Stocker AI cost
    const netSavings = estimatedSavings - stockerCost;

    return {
      estimatedSavings,
      stockerCost,
      netSavings,
    };
  }, [drivers, hourlyWage, pickingHours, reduction]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

          {[
            { id: "picking-hours", label: "Picking hours per route per workday", value: pickingHours, set: setPickingHours, min: 0, max: 24, step: 0.25 },
            { id: "time-reduction", label: "Estimated picking-time reduction (%)", value: reduction, set: setReduction, min: 25, max: 35, step: 1 },
          ].map(({ id, label, value, set, min, max, step }) => (
            <div key={id} className="space-y-2">
              <Label htmlFor={id}>{label}</Label>
              <Input id={id} type="number" min={min} max={max} step={step} value={value}
                onChange={(e) => set(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
                className="max-w-[120px]" />
            </div>
          ))}
          {/* Hourly wage input */}
          <div className="space-y-2">
            <Label htmlFor="wage" className="text-base font-medium">
              Average hourly wage ($)
            </Label>
            <Input
              id="wage"
              type="number"
              min={0} step={0.5}
              value={hourlyWage}
              onChange={(e) => setHourlyWage(Math.max(0, Number(e.target.value) || 0))}
              className="max-w-[120px]"
            />
          </div>
        </div>

        {/* Results */}
        <div className="bg-alt rounded-lg p-6 space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted-foreground">Monthly value of picking time saved</span>
            <span className="text-xl font-semibold text-foreground">
              {formatCurrency(calculations.estimatedSavings)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted-foreground">Stocker AI cost</span>
            <span className="text-lg text-foreground">
              {formatCurrency(calculations.stockerCost)}/mo
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-lg font-medium text-foreground">Monthly value after subscription</span>
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
          Assumes one route per driver per workday, five workdays per week, and 52 working weeks per year. Savings use picking time only. The 35% default is an assumed reduction in time, not a guaranteed result. Time freed up is not necessarily a reduction in payroll. Subscription pricing includes a two-driver minimum.
        </p>
      </div>
    </div>
  );
};

export default ROICalculator;