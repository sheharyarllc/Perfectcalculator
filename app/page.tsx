"use client";

import React, { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type PaymentFrequency = "monthly" | "biweekly" | "weekly" | "semimonthly";

const PERIODS_PER_YEAR: Record<PaymentFrequency, number> = {
  monthly: 12,
  biweekly: 26,
  weekly: 52,
  semimonthly: 24,
};

const FREQUENCY_LABEL: Record<PaymentFrequency, string> = {
  monthly: "per month",
  biweekly: "every 2 weeks",
  weekly: "per week",
  semimonthly: "twice per month",
};

type AmortizationRow = {
  year: number;
  principal: number;
  interest: number;
  remaining: number;
  cumulativePrincipal: number;
  cumulativeInterest: number;
};

export default function MortgageCalculator() {
  // Core loan inputs
  const [loanAmount, setLoanAmount] = useState(300000);
  const [interestRate, setInterestRate] = useState(5);
  const [loanTerm, setLoanTerm] = useState(30);

  // PITI-style inputs
  const [homeValue, setHomeValue] = useState(300000);
  const [propertyTaxRate, setPropertyTaxRate] = useState(1.8);
  const [yearlyInsurance, setYearlyInsurance] = useState(1000);
  const [monthlyHOA, setMonthlyHOA] = useState(0);

  // Misc inputs
  const [firstPaymentDate, setFirstPaymentDate] = useState<string>("");
  const [paymentFrequency, setPaymentFrequency] =
    useState<PaymentFrequency>("monthly");
  const [extraPaymentPerPeriod, setExtraPaymentPerPeriod] = useState(0);

  // UI state
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  // --- Core math based on frequency ---

  const periodsPerYear = PERIODS_PER_YEAR[paymentFrequency];
  const ratePerPeriod = interestRate / 100 / periodsPerYear;
  const totalPeriods = loanTerm * periodsPerYear;

  const paymentPerPeriod =
    loanAmount <= 0 || totalPeriods <= 0
      ? 0
      : ratePerPeriod === 0
      ? loanAmount / totalPeriods
      : (loanAmount *
          ratePerPeriod *
          Math.pow(1 + ratePerPeriod, totalPeriods)) /
        (Math.pow(1 + ratePerPeriod, totalPeriods) - 1);

  // Convert per-period payment to an approximate monthly amount
  const principalAndInterestPerMonth = (paymentPerPeriod * periodsPerYear) / 12;
  const extraPerMonth = (extraPaymentPerPeriod * periodsPerYear) / 12;

  // PITI-style breakdown
  const yearlyPropertyTax = homeValue * (propertyTaxRate / 100);
  const monthlyPropertyTax = yearlyPropertyTax / 12;
  const monthlyInsurance = yearlyInsurance / 12;
  const monthlyPITI =
    principalAndInterestPerMonth +
    monthlyPropertyTax +
    monthlyInsurance +
    monthlyHOA +
    extraPerMonth;

  // --- Amortization schedule (per-period, then rolled up to yearly) ---

  const calculateAmortization = (): AmortizationRow[] => {
    if (loanAmount <= 0 || loanTerm <= 0 || totalPeriods <= 0) {
      return [];
    }

    let balance = loanAmount;

    type YearBucket = {
      principal: number;
      interest: number;
      remaining: number;
    };

    const byYear = new Map<number, YearBucket>();

    for (let period = 1; period <= totalPeriods && balance > 0.01; period++) {
      const interestPayment = ratePerPeriod === 0 ? 0 : balance * ratePerPeriod;
      let principalPayment =
        paymentPerPeriod - interestPayment + extraPaymentPerPeriod;

      // Prevent paying more principal than the remaining balance
      if (principalPayment > balance + interestPayment) {
        principalPayment = balance;
      }

      const year = Math.ceil(period / periodsPerYear);
      const current = byYear.get(year) ?? {
        principal: 0,
        interest: 0,
        remaining: balance,
      };

      current.principal += principalPayment;
      current.interest += interestPayment;

      balance -= principalPayment;
      current.remaining = Math.max(0, balance);

      byYear.set(year, current);

      if (balance <= 0.01) {
        break;
      }
    }

    const rows: AmortizationRow[] = [];
    let cumulativePrincipal = 0;
    let cumulativeInterest = 0;

    const years = Array.from(byYear.keys()).sort((a, b) => a - b);

    for (const year of years) {
      const bucket = byYear.get(year)!;
      cumulativePrincipal += bucket.principal;
      cumulativeInterest += bucket.interest;

      rows.push({
        year,
        principal: bucket.principal,
        interest: bucket.interest,
        remaining: bucket.remaining,
        cumulativePrincipal,
        cumulativeInterest,
      });
    }

    return rows;
  };

  const amortizationData = calculateAmortization();
  const lastRow =
    amortizationData.length > 0
      ? amortizationData[amortizationData.length - 1]
      : undefined;

  const totalInterest = lastRow?.cumulativeInterest ?? 0;
  const totalPrincipal = lastRow?.cumulativePrincipal ?? loanAmount;
  const totalPayment = totalPrincipal + totalInterest;

  // Chart Data (pie + line)
  const pieData = [
    { name: "Principal (Asal)", value: totalPrincipal },
    { name: "Total Interest (Sood)", value: totalInterest },
  ];
  const COLORS = ["#2563eb", "#f87171"];

  const lineChartData = amortizationData.map((row) => ({
    year: row.year,
    balance: row.remaining,
    totalInterest: row.cumulativeInterest,
  }));

  const rowsToShow = showFullSchedule
    ? amortizationData
    : amortizationData.slice(0, 10);

  // --- Export helpers (Excel/CSV & PDF/Print section) ---

  const handleExportExcel = () => {
    if (typeof window === "undefined") return;

    const header = [
      "Year",
      "Principal Paid",
      "Interest Paid",
      "Cumulative Principal",
      "Cumulative Interest",
      "Remaining Balance",
    ];

    const rows = amortizationData.map((row) => [
      row.year,
      row.principal.toFixed(2),
      row.interest.toFixed(2),
      row.cumulativePrincipal.toFixed(2),
      row.cumulativeInterest.toFixed(2),
      row.remaining.toFixed(2),
    ]);

    const csvContent = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "amortization_schedule.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (typeof window === "undefined") return;
    const section = document.getElementById("amortization-section");
    if (!section) return;

    const printWindow = window.open("", "", "width=900,height=650");
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Amortization Schedule</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
            th { background: #f3f4f6; text-transform: uppercase; font-weight: 600; font-size: 11px; }
          </style>
        </head>
        <body>
          <h1>Amortization Schedule</h1>
          ${section.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // --- UI ---

  return (
    <main className="bg-slate-50 px-4 pb-10 pt-6 text-slate-900 md:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 md:mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">
            Finance · Mortgage
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            Smart Mortgage AI
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 md:text-base">
            Interactive, visual insights for your home loan. Adjust payments,
            see payoff timelines, and export a clean report.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Inputs Panel */}
          <div className="lg:col-span-1 space-y-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-xl md:p-8">
            <h3 className="text-xl font-bold">Mortgage Information</h3>

            {/* Core loan inputs */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold text-slate-600">
                  Loan Amount
                </label>
                <input
                  type="number"
                  min={50000}
                  max={2000000}
                  step={1000}
                  value={loanAmount}
                  onChange={(e) =>
                    setLoanAmount(Number(e.target.value) || 0)
                  }
                  className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold text-slate-600">
                  Interest Rate (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={25}
                  step={0.05}
                  value={interestRate}
                  onChange={(e) =>
                    setInterestRate(Number(e.target.value) || 0)
                  }
                  className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold text-slate-600">
                  Term Length (Years)
                </label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  step={1}
                  value={loanTerm}
                  onChange={(e) =>
                    setLoanTerm(Number(e.target.value) || 0)
                  }
                  className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold text-slate-600">
                  First Payment Date
                </label>
                <input
                  type="date"
                  value={firstPaymentDate}
                  onChange={(e) => setFirstPaymentDate(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold text-slate-600">
                  Payment Frequency
                </label>
                <select
                  value={paymentFrequency}
                  onChange={(e) =>
                    setPaymentFrequency(e.target.value as PaymentFrequency)
                  }
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Bi-Weekly</option>
                  <option value="weekly">Weekly</option>
                  <option value="semimonthly">Semi-Monthly</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold text-slate-600">
                  Extra Payment per Period
                </label>
                <input
                  type="number"
                  min={0}
                  step={25}
                  value={extraPaymentPerPeriod}
                  onChange={(e) =>
                    setExtraPaymentPerPeriod(Number(e.target.value) || 0)
                  }
                  className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <hr className="my-4 border-slate-100" />

            {/* Estimated PITI section */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-700">
                Estimated PITI (Principal, Interest, Taxes, Insurance)
              </h4>

              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm text-slate-600">
                  Home Value
                </label>
                <input
                  type="number"
                  min={50000}
                  max={3000000}
                  step={1000}
                  value={homeValue}
                  onChange={(e) =>
                    setHomeValue(Number(e.target.value) || 0)
                  }
                  className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm text-slate-600">
                  Property Tax (% of value)
                </label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.05}
                  value={propertyTaxRate}
                  onChange={(e) =>
                    setPropertyTaxRate(Number(e.target.value) || 0)
                  }
                  className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm text-slate-600">
                  Yearly Home Insurance
                </label>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={50}
                  value={yearlyInsurance}
                  onChange={(e) =>
                    setYearlyInsurance(Number(e.target.value) || 0)
                  }
                  className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm text-slate-600">
                  Monthly HOA (optional)
                </label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={25}
                  value={monthlyHOA}
                  onChange={(e) =>
                    setMonthlyHOA(Number(e.target.value) || 0)
                  }
                  className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Results & Visuals Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Principal & Interest Card */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-blue-100/50 p-6 shadow-lg">
                <div className="relative z-10">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-700/70">
                    Principal &amp; Interest
                  </p>
                  <p className="mt-1 text-xs text-blue-600/80">
                    {FREQUENCY_LABEL[paymentFrequency]}
                  </p>
                  <div className="mt-3 text-4xl font-black text-blue-700 md:text-5xl">
                    ${paymentPerPeriod.toFixed(2)}
                  </div>
                </div>
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-blue-200/30 blur-2xl" />
              </div>

              {/* Total Monthly PITI Card */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/50 p-6 shadow-lg">
                <div className="relative z-10">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Estimated Total Monthly PITI
                  </p>
                  <div className="mt-3 text-4xl font-black text-slate-900 md:text-5xl">
                    ${monthlyPITI.toFixed(2)}
                  </div>
                </div>
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-slate-200/30 blur-2xl" />
              </div>
            </div>

            {/* Breakdown Section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-700">
                Monthly Breakdown
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-600">
                    Principal &amp; Interest
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    ${principalAndInterestPerMonth.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-600">
                    Property Taxes
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    ${monthlyPropertyTax.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-600">
                    Home Insurance
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    ${monthlyInsurance.toFixed(2)}
                  </span>
                </div>
                {monthlyHOA > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                    <span className="text-sm font-medium text-slate-600">
                      HOA Fees
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      ${monthlyHOA.toFixed(2)}
                    </span>
                  </div>
                )}
                {extraPaymentPerPeriod > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-green-50 px-4 py-3 border border-green-200">
                    <span className="text-sm font-medium text-green-700">
                      Extra Principal Payment
                    </span>
                    <span className="text-sm font-bold text-green-700">
                      +${extraPerMonth.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Visual Breakdown & Chart */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Principal vs Interest Visual */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-700">
                  Loan Breakdown
                </h3>
                <div className="space-y-4">
                  {/* Principal Bar */}
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">
                        Principal
                      </span>
                      <span className="font-bold text-blue-600">
                        $
                        {totalPrincipal.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                        style={{
                          width: `${
                            (totalPrincipal / totalPayment) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Interest Bar */}
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">
                        Interest
                      </span>
                      <span className="font-bold text-red-500">
                        $
                        {totalInterest.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-500 transition-all duration-500"
                        style={{
                          width: `${(totalInterest / totalPayment) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4">
                    <div>
                      <p className="text-xs text-slate-500">Total Interest</p>
                      <p className="mt-1 text-lg font-bold text-red-600">
                        $
                        {totalInterest.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total Payback</p>
                      <p className="mt-1 text-lg font-bold text-slate-900">
                        $
                        {totalPayment.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Line Chart */}
              {lineChartData.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-700">
                    Payment Timeline
                  </h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lineChartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#e2e8f0"
                        />
                        <XAxis
                          dataKey="year"
                          tickLine={false}
                          axisLine={false}
                          fontSize={11}
                          stroke="#94a3b8"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          fontSize={11}
                          stroke="#94a3b8"
                          tickFormatter={(v) =>
                            `$${(v / 1000).toFixed(0)}k`
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          }}
                          formatter={(value: number | undefined) =>
                            `$${(value ?? 0).toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}`
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="balance"
                          name="Remaining Balance"
                          stroke="#2563eb"
                          strokeWidth={3}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="totalInterest"
                          name="Cumulative Interest"
                          stroke="#f97316"
                          strokeWidth={3}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Yearly Breakdown table */}
        <div
          id="amortization-section"
          className="mt-10 overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 shadow-xl md:mt-12 md:p-8"
        >
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-2xl font-bold text-slate-800">
                Yearly Amortization Breakdown
              </h3>
              <p className="text-sm text-slate-500">
                See how your payments are split between principal and interest
                over time.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Export to Excel
              </button>
              <button
                type="button"
                onClick={handleExportPDF}
                className="inline-flex items-center rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700 focus:ring-offset-2"
              >
                Export to PDF
              </button>
              <button
                type="button"
                onClick={() => setShowFullSchedule(!showFullSchedule)}
                className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {showFullSchedule
                  ? "Show first 10 years"
                  : "Show full schedule"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-3 font-semibold">Year</th>
                  <th className="py-3 font-semibold">Principal Paid</th>
                  <th className="py-3 font-semibold">Interest Paid</th>
                  <th className="py-3 font-semibold">Cumulative Principal</th>
                  <th className="py-3 font-semibold">Cumulative Interest</th>
                  <th className="py-3 font-semibold">Remaining Balance</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-600">
                {rowsToShow.map((row) => (
                  <tr
                    key={row.year}
                    className="border-b border-slate-50 transition-colors hover:bg-slate-50"
                  >
                    <td className="py-3 font-medium text-slate-900">
                      Year {row.year}
                    </td>
                    <td className="py-3 text-blue-600">
                      $
                      {row.principal.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-3 text-red-500">
                      $
                      {row.interest.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-3">
                      $
                      {row.cumulativePrincipal.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-3">
                      $
                      {row.cumulativeInterest.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-3 font-semibold">
                      $
                      {row.remaining.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!showFullSchedule && amortizationData.length > 10 && (
              <p className="mt-6 text-center text-sm italic text-slate-400">
                Showing first 10 years. Click &quot;Show full schedule&quot; to
                see all years.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
