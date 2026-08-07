"use client";

import { useMemo, useState } from "react";

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ink-muted">{label}</span>
        <span className="font-tabular text-sm font-medium text-ink">
          {value.toLocaleString()}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[var(--ready)]"
      />
    </label>
  );
}

export function ImpactCalculator() {
  const [invoicesPerMonth, setInvoicesPerMonth] = useState(2000);
  const [minutesPerInvoice, setMinutesPerInvoice] = useState(8);
  const [straightThroughPct, setStraightThroughPct] = useState(60);
  const [apCostPerHour, setApCostPerHour] = useState(34);
  const [automationCostPerInvoice, setAutomationCostPerInvoice] = useState(0.08);

  const outputs = useMemo(() => {
    const eligibleInvoices = Math.round(invoicesPerMonth * (straightThroughPct / 100));
    const hoursReturned = (eligibleInvoices * minutesPerInvoice) / 60;
    const exceptionCount = Math.round(invoicesPerMonth * 0.25);
    const grossLaborSavings = hoursReturned * apCostPerHour;
    const automationCost = invoicesPerMonth * automationCostPerInvoice;
    const netMonthlySavings = grossLaborSavings - automationCost;
    return {
      eligibleInvoices,
      hoursReturned,
      exceptionCount,
      netMonthlySavings,
      automationCost,
    };
  }, [invoicesPerMonth, minutesPerInvoice, straightThroughPct, apCostPerHour, automationCostPerInvoice]);

  return (
    <div className="card-paper p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Inputs — illustrative, adjust freely
          </h3>
          <Slider
            label="Invoices processed per month"
            value={invoicesPerMonth}
            onChange={setInvoicesPerMonth}
            min={200}
            max={10000}
            step={100}
          />
          <Slider
            label="Average manual preparation time"
            value={minutesPerInvoice}
            onChange={setMinutesPerInvoice}
            min={2}
            max={20}
            step={1}
            suffix=" min"
          />
          <Slider
            label="Eligible for straight-through preparation"
            value={straightThroughPct}
            onChange={setStraightThroughPct}
            min={20}
            max={90}
            step={5}
            suffix="%"
          />
          <Slider
            label="AP labor cost per hour"
            value={apCostPerHour}
            onChange={setApCostPerHour}
            min={18}
            max={70}
            step={1}
            suffix=" $/hr"
          />
          <Slider
            label="Automation cost per invoice"
            value={automationCostPerInvoice}
            onChange={setAutomationCostPerInvoice}
            min={0.02}
            max={0.5}
            step={0.01}
            suffix=" $"
          />
        </div>

        <div className="space-y-4 border-t border-rule pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Illustrative monthly outputs
          </h3>
          <div>
            <div className="font-display text-3xl font-semibold text-ready">
              {Math.round(outputs.hoursReturned).toLocaleString()} hrs
            </div>
            <p className="text-xs text-ink-muted">AP hours potentially returned</p>
          </div>
          <div>
            <div className="font-display text-3xl font-semibold text-ink">
              {fmtMoney(outputs.netMonthlySavings)}
            </div>
            <p className="text-xs text-ink-muted">
              Estimated net monthly savings (labor returned minus automation cost)
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 text-sm">
            <dt className="text-ink-faint">Prepared without manual entry</dt>
            <dd className="text-right font-tabular text-ink">
              {outputs.eligibleInvoices.toLocaleString()} invoices
            </dd>
            <dt className="text-ink-faint">Estimated exception rate</dt>
            <dd className="text-right font-tabular text-ink">25% ({outputs.exceptionCount.toLocaleString()}/mo)</dd>
            <dt className="text-ink-faint">Automation cost</dt>
            <dd className="text-right font-tabular text-ink">{fmtMoney(outputs.automationCost)}/mo</dd>
            <dt className="text-ink-faint">First-pass preparation time</dt>
            <dd className="text-right font-tabular text-ink">minutes → under 30s</dd>
          </dl>
        </div>
      </div>
      <p className="mt-6 border-t border-rule pt-3 text-[11px] text-ink-faint">
        Demonstration assumptions, not customer outcomes. Defaults reproduce this
        project&rsquo;s own stated fictional baseline (2,000 invoices/mo, 8 min manual
        prep, 60% straight-through → 160 AP hours/mo).
      </p>
    </div>
  );
}
