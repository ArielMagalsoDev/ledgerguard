/*
 * Impact calculator. Reads the 5 range inputs on `input`, recomputes the
 * derived outputs, and writes them into the DOM.
 *
 * Worked example (the calculator's own defaults): 2000 invoices/month x 8
 * min x 60% straight-through => 1200 eligible invoices => 160 AP hours/month
 * returned (1200 * 8 / 60 = 160), matching the project's stated baseline.
 */
(function () {
  "use strict";

  function fmtMoney(n) {
    var sign = n < 0 ? "-" : "";
    return sign + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("impact-calculator");
    if (!root) return;

    var invoicesPerMonth = root.querySelector("[data-input='invoicesPerMonth']");
    var minutesPerInvoice = root.querySelector("[data-input='minutesPerInvoice']");
    var straightThroughPct = root.querySelector("[data-input='straightThroughPct']");
    var apCostPerHour = root.querySelector("[data-input='apCostPerHour']");
    var automationCostPerInvoice = root.querySelector("[data-input='automationCostPerInvoice']");
    var inputs = [invoicesPerMonth, minutesPerInvoice, straightThroughPct, apCostPerHour, automationCostPerInvoice];

    var outHours = root.querySelector("[data-output='hoursReturned']");
    var outSavings = root.querySelector("[data-output='netMonthlySavings']");
    var outEligible = root.querySelector("[data-output='eligibleInvoices']");
    var outExceptions = root.querySelector("[data-output='exceptionCount']");
    var outAutomationCost = root.querySelector("[data-output='automationCost']");
    var outCostPerInvoice = root.querySelector("[data-output='costPerInvoice']");

    function updateLabel(input) {
      var wrap = input.closest("label");
      if (!wrap) return;
      var valueEl = wrap.querySelector("[data-value]");
      if (!valueEl) return;
      var suffix = input.getAttribute("data-suffix") || "";
      valueEl.textContent = Number(input.value).toLocaleString() + suffix;
    }

    function recompute() {
      var invoices = Number(invoicesPerMonth.value);
      var minutes = Number(minutesPerInvoice.value);
      var straightThrough = Number(straightThroughPct.value);
      var laborCost = Number(apCostPerHour.value);
      var automationCostPer = Number(automationCostPerInvoice.value);

      var eligibleInvoices = Math.round(invoices * (straightThrough / 100));
      var hoursReturned = (eligibleInvoices * minutes) / 60;
      var exceptionCount = Math.round(invoices * 0.25);
      var grossLaborSavings = hoursReturned * laborCost;
      var automationCost = invoices * automationCostPer;
      var netMonthlySavings = grossLaborSavings - automationCost;
      // Blended cost per invoice: automation runs on every invoice, plus the
      // remaining manual labor for whatever isn't straight-through eligible.
      var remainingManualHours = ((invoices - eligibleInvoices) * minutes) / 60;
      var totalMonthlyCost = automationCost + remainingManualHours * laborCost;
      var costPerInvoice = totalMonthlyCost / invoices;

      if (outHours) outHours.textContent = Math.round(hoursReturned).toLocaleString() + " hrs";
      if (outSavings) outSavings.textContent = fmtMoney(netMonthlySavings);
      if (outEligible) outEligible.textContent = eligibleInvoices.toLocaleString() + " invoices";
      if (outExceptions) outExceptions.textContent = "25% (" + exceptionCount.toLocaleString() + "/mo)";
      if (outAutomationCost) outAutomationCost.textContent = fmtMoney(automationCost) + "/mo";
      if (outCostPerInvoice) outCostPerInvoice.textContent = "$" + costPerInvoice.toFixed(2);
    }

    inputs.forEach(function (input) {
      if (!input) return;
      input.addEventListener("input", function () {
        updateLabel(input);
        recompute();
      });
    });

    recompute();
  });
})();
