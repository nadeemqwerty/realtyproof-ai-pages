(function () {
  "use strict";
  const DAY = 86400000;
  const unavailable = "Unavailable";
  const date = (value) => {
    const parsed = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : null;
    return parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : null;
  };
  const validFlows = (flows) => {
    if (!Array.isArray(flows) || flows.length < 2) return null;
    const parsed = flows.map((flow) => ({ amount: Number(flow.amount), date: date(flow.date) })).sort((a, b) => a.date - b.date);
    return parsed.some((flow) => !Number.isFinite(flow.amount) || !flow.date) ||
      !parsed.some((flow) => flow.amount < 0) || !parsed.some((flow) => flow.amount > 0) ? null : parsed;
  };
  function xnpv(rate, flows) {
    const start = flows[0].date.getTime();
    return flows.reduce((sum, flow) => sum + flow.amount / Math.pow(1 + rate, (flow.date - start) / DAY / 365), 0);
  }
  function xirr(flows) {
    const parsed = validFlows(flows);
    if (!parsed) return { value: null, reason: "Enter valid dated inflows and outflows." };
    let low = -0.9999, high = 1, lowValue = xnpv(low, parsed), highValue = xnpv(high, parsed);
    for (let i = 0; i < 60 && lowValue * highValue > 0; i += 1) {
      high = high * 2 + 1;
      highValue = xnpv(high, parsed);
    }
    if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) {
      return { value: null, reason: "No XIRR solution exists for these dated cash flows." };
    }
    for (let i = 0; i < 200; i += 1) {
      const mid = (low + high) / 2, midValue = xnpv(mid, parsed);
      if (Math.abs(midValue) < 0.000001) return { value: mid, reason: "" };
      if (lowValue * midValue <= 0) high = mid;
      else { low = mid; lowValue = midValue; }
    }
    return { value: (low + high) / 2, reason: "" };
  }
  function npv(rate, flows) {
    const parsed = validFlows(flows), decimal = Number(rate);
    return !parsed || !Number.isFinite(decimal) || decimal <= -1 ? null : xnpv(decimal, parsed);
  }
  function payback(flows) {
    const parsed = validFlows(flows);
    if (!parsed) return { date: null, years: null };
    let cumulative = 0;
    for (let i = 0; i < parsed.length; i += 1) {
      cumulative += parsed[i].amount;
      if (cumulative < 0) continue;
      return {
        date: parsed[i].date.toISOString().slice(0, 10),
        years: (parsed[i].date - parsed[0].date) / DAY / 365
      };
    }
    return { date: null, years: null };
  }
  const addMonths = (value, months) => {
    const result = new Date(value.getTime());
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
  };
  const input = (form, name) => Number(form.elements[name]?.value);
  const inputDate = (form, name) => date(form.elements[name]?.value);
  function scenarioFlows(form, scenario) {
    const start = inputDate(form, "purchaseDate"), delivery = inputDate(form, "deliveryDate");
    const price = input(form, "purchasePrice"), down = input(form, "downPayment") / 100;
    const bsp = input(form, "bspExtras"), allIn = input(form, "allInExtras"), rate = input(form, "financeRate") / 100, years = input(form, "loanYears"), paymentStart = input(form, "paymentStartMonths");
    const rent = input(form, `rent-${scenario}`), vacancy = input(form, `vacancy-${scenario}`) / 100, maintenance = input(form, `maintenance-${scenario}`);
    const appreciation = input(form, `appreciation-${scenario}`) / 100, delay = input(form, `delay-${scenario}`), exitMonths = input(form, `exit-${scenario}`);
    const tax = input(form, `tax-${scenario}`) / 100, exitCost = input(form, `exitCost-${scenario}`) / 100;
    if (!start || !delivery || !Number.isFinite(price) || price <= 0 || !Number.isFinite(down) || down < 0 || down > 1 ||
      [bsp, allIn, rate, years, paymentStart, rent, vacancy, maintenance, appreciation, delay, exitMonths, tax, exitCost].some((value) => !Number.isFinite(value)) ||
      bsp < 0 || allIn < 0 || rate < 0 || years <= 0 || rent < 0 || vacancy < 0 || vacancy >= 1 || maintenance < 0 ||
      paymentStart < 0 || delay < 0 || exitMonths <= 0 || tax < 0 || exitCost < 0) return null;
    const totalCost = price + bsp + allIn, loan = totalCost * (1 - down), payments = Math.max(1, Math.round(years * 12)), monthlyRate = rate / 12;
    const emi = loan === 0 ? 0 : monthlyRate === 0 ? loan / payments : loan * monthlyRate * Math.pow(1 + monthlyRate, payments) / (Math.pow(1 + monthlyRate, payments) - 1);
    const effectiveDelivery = addMonths(delivery, Math.round(delay)), exit = addMonths(effectiveDelivery, Math.round(exitMonths));
    const flows = [{ date: start.toISOString().slice(0, 10), amount: -(totalCost * down) }];
    let loanBalanceAtExit = loan;
    let paymentsBeforeExit = 0;
    for (let month = 1; month <= payments; month += 1) {
      const paymentDate = addMonths(start, Math.round(paymentStart) + month);
      if (paymentDate <= exit) {
        flows.push({ date: paymentDate.toISOString().slice(0, 10), amount: -emi });
        const interest = loanBalanceAtExit * monthlyRate;
        loanBalanceAtExit = Math.max(0, loanBalanceAtExit - Math.max(0, emi - interest));
        paymentsBeforeExit += 1;
      }
    }
    for (let month = 1; month <= Math.round(exitMonths); month += 1) {
      const rentDate = addMonths(effectiveDelivery, month);
      if (rentDate <= exit) flows.push({ date: rentDate.toISOString().slice(0, 10), amount: rent * (1 - vacancy) - maintenance });
    }
    const sale = price * Math.pow(1 + appreciation, Math.max(0, (exit - start) / DAY / 365));
    flows.push({
      date: exit.toISOString().slice(0, 10),
      amount: sale * (1 - exitCost) - Math.max(0, sale - totalCost) * tax - loanBalanceAtExit
    });
    return {
      flows,
      initialCash: totalCost * down,
      annualNetRent: 12 * (rent * (1 - vacancy) - maintenance),
      annualDebtService: emi * Math.min(12, payments),
      loanBalanceAtExit,
      paymentsBeforeExit,
      delay
    };
  }
  function model(form, scenario) {
    const built = scenarioFlows(form, scenario), discount = input(form, "discountRate") / 100;
    if (!built || !Number.isFinite(discount) || discount <= -1) return { valid: false, reason: "Enter a positive price, valid dates and complete scenario assumptions." };
    const irr = xirr(built.flows), paid = payback(built.flows);
    return {
      valid: true,
      irr,
      npv: npv(discount, built.flows),
      payback: paid,
      cashOnCash: built.initialCash > 0
        ? (built.annualNetRent - built.annualDebtService) / built.initialCash
        : null,
      loanBalanceAtExit: built.loanBalanceAtExit,
      delay: built.delay
    };
  }
  const money = (value) => Number.isFinite(value) ? `Rs ${Math.round(value).toLocaleString("en-IN")}` : unavailable;
  const percent = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : unavailable;
  function render() {
    const container = document.getElementById("page-content");
    if (!container) return;
    const project = new URLSearchParams(location.search).get("project");
    const scenario = (id, label) => `<fieldset class="scenario-fieldset"><legend>${label} scenario</legend>
      <label>User assumption · Monthly rent (Rs)<input name="rent-${id}" type="number" min="0" value="0"></label><label>User assumption · Vacancy (%)<input name="vacancy-${id}" type="number" min="0" max="99" value="0"></label>
      <label>User assumption · Monthly maintenance (Rs)<input name="maintenance-${id}" type="number" min="0" value="0"></label><label>User assumption · Annual price change (%)<input name="appreciation-${id}" type="number" min="-99" value="0"></label>
      <label>User assumption · Delivery delay (months)<input name="delay-${id}" type="number" min="0" value="0"></label><label>User assumption · Exit after delivery (months)<input name="exit-${id}" type="number" min="1" value="60"></label>
      <label>User assumption · Tax on gain (%)<input name="tax-${id}" type="number" min="0" value="0"></label><label>User assumption · Exit cost (%)<input name="exitCost-${id}" type="number" min="0" value="0"></label></fieldset>`;
    container.innerHTML = `<section class="hero"><p class="kicker">Tools · Returns</p><h1>Editable return scenarios</h1><p class="deck">Dated cash-flow modelling with transparent assumptions. Outputs describe entered scenarios only.</p></section>
      <section class="panel calculator-notice"><h2>${project ? "Project handoff has evidence gaps" : "Start with evidence status"}</h2><p>${project ? "Price, delivery and all-in cost are Unavailable in this project record. Enter each required field yourself; no value is prefilled as evidence." : "No project evidence has been prefilled. Enter each applicable input."}</p></section>
      <form class="returns-calculator" novalidate><section class="panel"><p class="eyebrow">Purchase and financing</p><h2>Required dated inputs</h2><div class="returns-grid">
      <label>Unavailable · Purchase price (Rs)<input name="purchasePrice" type="number" min="1" required placeholder="Enter price"></label><label>Unavailable · Purchase date<input name="purchaseDate" type="date" required></label><label>Unavailable · Delivery date<input name="deliveryDate" type="date" required></label>
      <label>User assumption · Down payment (%)<input name="downPayment" type="number" min="0" max="100" value="20"></label><label>Unavailable · BSP-linked extras (Rs)<input name="bspExtras" type="number" min="0" value="0"></label><label>Unavailable · Other all-in components (Rs)<input name="allInExtras" type="number" min="0" value="0"></label>
      <label>User assumption · Financing rate (%)<input name="financeRate" type="number" min="0" value="0"></label><label>User assumption · Loan term (years)<input name="loanYears" type="number" min="0.1" value="20"></label><label>User assumption · Loan payment starts after purchase (months)<input name="paymentStartMonths" type="number" min="0" value="0"></label><label>User assumption · NPV discount rate (%)<input name="discountRate" type="number" min="0" value="10"></label></div>
      <p class="data-note">Product assumption: monthly loan payments begin at purchase; monthly net rent begins after the entered delivery date. Replace assumptions that do not match your terms.</p></section>
      <section class="scenario-grid">${scenario("conservative", "Conservative")}${scenario("base", "Base")}${scenario("upside", "Upside")}</section>
      <section class="panel"><p class="eyebrow">Scenario outputs</p><h2>Returns and delay sensitivity</h2><div class="table-wrap"><table><caption class="sr-only">Returns scenario results</caption><thead><tr><th>Scenario</th><th>XIRR</th><th>NPV</th><th>Payback date / years</th><th>Cash-on-cash after debt service</th><th>Loan payoff at exit</th><th>Delay sensitivity</th></tr></thead><tbody data-results></tbody></table></div><p class="data-note" data-calculator-status aria-live="polite"></p></section></form>`;
    const form = container.querySelector("form"), results = container.querySelector("[data-results]"), status = container.querySelector("[data-calculator-status]");
    const update = () => {
      results.innerHTML = [["conservative", "Conservative"], ["base", "Base"], ["upside", "Upside"]].map(([id, label]) => {
        const output = model(form, id);
        if (!output.valid) return `<tr><th scope="row">${label}</th><td colspan="6">Unavailable — ${output.reason}</td></tr>`;
        const paybackLabel = output.payback.date ? `${output.payback.date} · ${output.payback.years.toFixed(2)} years` : "No payback within modelled exit";
        return `<tr><th scope="row">${label}</th><td>${output.irr.value == null ? `Unavailable — ${output.irr.reason}` : percent(output.irr.value)}</td><td>${money(output.npv)}</td><td>${paybackLabel}</td><td>${percent(output.cashOnCash)}</td><td>${money(output.loanBalanceAtExit)}</td><td>${output.delay} months entered</td></tr>`;
      }).join("");
      status.textContent = "Calculated in this browser only. Cash flows are not saved or transmitted.";
    };
    form.addEventListener("input", update); form.addEventListener("change", update); update();
  }
  window.RealtyProofCalculator = { xirr, xnpv, npv, payback, scenarioFlows, model };
  if (document.body?.dataset.page === "calculator") render();
})();
