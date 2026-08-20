(function () {
  "use strict";

  const rawData = window.YEIDA_DATA;
  const body = document.body;
  const page = body.dataset.page;
  const root = body.dataset.root || ".";
  const marketRegistry = window.REALTYPROOF_MARKETS || {
    defaultMarket: "gbn",
    markets: [{ id: "gbn", label: "GBN Overview", shortLabel: "GBN" }]
  };
  const marketParams = new URLSearchParams(window.location.search);
  const requestedMarket = marketParams.get("market");
  const activeMarket = marketRegistry.markets.some((market) => market.id === requestedMarket)
    ? requestedMarket
    : marketRegistry.defaultMarket;
  const activeMarketDefinition = marketRegistry.markets.find(
    (market) => market.id === activeMarket
  );
  const marketCollections = [
    "plots",
    "companies",
    "interestEvents",
    "housingProjects",
    "infrastructure",
    "clusters",
    "timelineEvents"
  ];
  const data = { ...rawData, meta: { ...rawData.meta } };
  for (const collection of marketCollections) {
    data[collection] = rawData[collection].filter((record) =>
      (record.marketIds || ["gbn"]).includes(activeMarket)
    );
  }
  if (!["gbn", "yeida"].includes(activeMarket)) {
    data.reraYeidaPlotMappings = [];
  }
  if (activeMarket !== "gbn") {
    const visibleSourceIds = new Set(
      marketCollections.flatMap((collection) =>
        data[collection].flatMap((record) => record.sourceIds || [])
      ).concat(
        (data.reraYeidaPlotMappings || []).flatMap((mapping) => mapping.sourceIds || [])
      )
    );
    data.sources = rawData.sources.filter((source) => visibleSourceIds.has(source.id));
  }
  data.meta.edition = `${activeMarketDefinition.label} Intelligence`;
  const executionStages = window.YEIDA_EXECUTION_STAGES?.stages || [];
  const marketAssignments = window.REALTYPROOF_MARKET_ASSIGNMENTS?.assignments || {};
  const reraProgress = window.REALTYPROOF_RERA_PROGRESS || { records: [] };
  const watchlistKey = "realtyproof-evidence-watchlist-v1";
  const reraFactLabels = {
    ENGINEER_ESTIMATED_TOTAL_COMPLETION_COST: "Engineer-estimated completion cost",
    ENGINEER_ESTIMATED_ACTUAL_COST_INCURRED: "Engineer-estimated actual cost incurred",
    ENGINEER_WORK_DONE_PERCENT: "Engineer-declared work done",
    ENGINEER_WORK_VALUE_PERCENT_OF_ESTIMATED_COST: "Work value versus estimated cost",
    CA_ACTUAL_SPEND_ADMISSIBLE_FOR_SEPARATE_ACCOUNT_WITHDRAWAL:
      "CA-certified actual spend admissible for withdrawal",
    ENGINEER_TABLE_DERIVED_ADMISSIBLE_EXPENDITURE:
      "Engineer table-derived admissible expenditure",
    ARCHITECT_SEWERAGE_SUBCOMPONENT_PROGRESS_PERCENT:
      "Architect-declared sewerage subcomponent progress"
  };
  const reraFactsByProject = new Map();
  for (const record of reraProgress.records || []) {
    if (!reraFactsByProject.has(record.projectId)) {
      reraFactsByProject.set(record.projectId, []);
    }
    reraFactsByProject.get(record.projectId).push(record);
  }
  for (const facts of reraFactsByProject.values()) {
    facts.sort((left, right) =>
      `${reraQuarterKey(left)}|${left.semanticFactType}|${left.recordId}`.localeCompare(
        `${reraQuarterKey(right)}|${right.semanticFactType}|${right.recordId}`
      )
    );
  }

  function reraQuarterKey(record) {
    const end = String(record.reportingQuarter || "").split(" To ").at(-1);
    const match = end?.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : end || "";
  }

  function reraFactValue(record) {
    const value = Number(record.value).toLocaleString("en-IN", {
      maximumFractionDigits: 4
    });
    return `${value}${record.unit ? ` ${record.unit}` : ""}`;
  }

  function reraFactSummary(facts) {
    const quarters = new Set(facts.map((fact) => fact.reportingQuarter)).size;
    return facts.length
      ? `${facts.length} reviewed facts · ${quarters} quarters`
      : "Unavailable";
  }

  function assignedMarketIds(record) {
    if (Array.isArray(record.marketIds) && record.marketIds.length) {
      return record.marketIds;
    }
    const assigned = marketAssignments[record.id]?.marketIds;
    return Array.isArray(assigned) && assigned.length ? assigned : ["gbn"];
  }

  function marketUrl(url) {
    return `${url}${url.includes("?") ? "&" : "?"}market=${encodeURIComponent(activeMarket)}`;
  }

  function projectCatalog() {
    const sourceMap = new Map(rawData.sources.map((source) => [source.id, source]));
    const launchProjects = (rawData.launchRatings?.researchQueue || [])
      .filter((project) => (project.marketIds || []).includes(activeMarket))
      .map((project) => ({
        ...project,
        sources: (project.sourceIds || []).map((id) => sourceMap.get(id)).filter(Boolean),
        marketLabel: activeMarketDefinition.label,
        phase: "Published project record",
        delivery: "Unavailable",
        price: "Unavailable",
        legalPromoterLabel: project.legalPromoter || "Unavailable",
        evidenceLabel: project.evidenceCoverage == null
          ? "Unavailable — coverage is not a recommendation"
          : `${project.evidenceCoverage}% — coverage is not a recommendation`
      }));
    const housingProjects = (rawData.housingProjects || [])
      .map((project) => {
        const marketIds = assignedMarketIds(project);
        const criticalMissing = Array.isArray(project.riskFlags) && project.riskFlags.length
          ? project.riskFlags
          : ["Current QPR, legal completion, all-in cost and comparable deed evidence"];
        return {
          id: project.id,
          projectName: project.name,
          reraNumber: project.rera || null,
          marketIds,
          location: [
            project.sector ? `Sector ${project.sector}` : null,
            project.plot
          ].filter(Boolean).join(" · ") || "Unavailable",
          legalPromoter: project.promoter || null,
          legalPromoterLabel: project.promoter || "Unavailable",
          phase: project.stage
            ? `Published ${project.stage} housing record`
            : "Published housing record",
          delivery: project.possession || project.constructionState || "Unavailable",
          price: project.priceEvidence || "Unavailable",
          evidenceCoverage: null,
          evidenceLabel: `${project.coverage || "Unavailable"} — coverage is not a recommendation`,
          criticalMissing,
          ratingStatus: "NR",
          ratingReason:
            "Current evidence does not satisfy the rating gates for QPR, independent construction, legal completion, all-in cost and comparable deeds.",
          confidence: project.confidence || "UNVERIFIED",
          lastVerified: project.lastVerified || rawData.meta.asOf,
          sourceIds: project.sourceIds || [],
          sources: (project.sourceIds || [])
            .map((id) => sourceMap.get(id))
            .filter(Boolean),
          marketLabel: activeMarketDefinition.label
        };
      })
      .filter((project) => project.marketIds.includes(activeMarket));
    const combined = [...new Map(
      [...launchProjects, ...housingProjects].map((project) => [project.id, project])
    ).values()];
    return combined.map((project) => {
      const reraFacts = reraFactsByProject.get(project.id) || [];
      return {
        ...project,
        reraFacts,
        reraFactSummary: reraFactSummary(reraFacts),
        latestReraQuarter: reraFacts.at(-1)?.reportingQuarter || null,
        ratingReason: reraFacts.length
          ? "Reviewed document-declared RERA facts are linked, but independent construction, legal completion, all-in cost and comparable deed gates remain unmet."
          : project.ratingReason
      };
    });
  }

  function projectUrl(id) {
    return marketUrl(`${root}/pages/detail.html?project=${encodeURIComponent(id)}`);
  }

  function projectMapUrl(project) {
    const authority = project.marketIds.includes("yeida")
      ? "yeida"
      : project.marketIds.includes("greater-noida")
        ? "gnida"
        : project.marketIds.includes("noida") ? "noida" : "all";
    return marketUrl(
      `${root}/pages/map.html?project=${encodeURIComponent(project.id)}` +
      `&authority=${encodeURIComponent(authority)}&categories=group-housing` +
      `&search=${encodeURIComponent(project.projectName)}`
    );
  }

  function globalSearchMarkup(compact = false) {
    return `<form class="global-project-search ${compact ? "compact" : ""}" data-global-project-search role="search">
      <label>${compact ? "Search projects" : "Find a project, RERA, builder or sector"}
      <div class="global-search-controls">
        <input name="q" type="search" autocomplete="off"
          placeholder="Project, RERA, builder, sector or market">
        <button type="submit">Search</button>
      </div></label>
      <p>Searches the published static project records only.</p>
    </form>`;
  }

  function readWatchlist() {
    try {
      const value = JSON.parse(localStorage.getItem(watchlistKey) || "{}");
      return {
        projects: Array.isArray(value.projects) ? value.projects : [],
        builders: Array.isArray(value.builders) ? value.builders : [],
        savedProjects: Array.isArray(value.savedProjects) ? value.savedProjects : []
      };
    } catch {
      return { projects: [], builders: [], savedProjects: [] };
    }
  }

  function writeWatchlist(value) {
    try {
      localStorage.setItem(watchlistKey, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function watchButton(kind, id, label = "Compare") {
    const selected = readWatchlist()[kind].includes(id);
    return `<button type="button" class="watch-toggle" data-watch-kind="${escapeHtml(kind)}"
      data-watch-id="${escapeHtml(id)}" aria-pressed="${selected}">
      ${selected ? "Remove" : `+ ${escapeHtml(label)}`}
    </button>`;
  }

  const navGroups = [
    {
      label: "Overview",
      routes: [
        ["home", "Home", `${root}/index.html`, "HM"],
        ["projects", "Projects", `${root}/pages/projects.html`, "PR"],
        ["compare", "Shortlist and compare", `${root}/pages/compare.html`, "CP"],
        ["about", "About and overview", `${root}/pages/about.html`, "AB"]
      ]
    },
    {
      label: "Explore the market",
      routes: [
        ["map", "Interactive map", `${root}/pages/map.html`, "MP"],
        ["land", "Land and allotments", `${root}/pages/land.html`, "LD"]
      ]
    },
    {
      label: "Economy and housing",
      routes: [
        ["companies", "Companies and jobs", `${root}/pages/companies.html`, "CO"],
        ["builders", "Builder profiles", `${root}/pages/builders.html`, "BU"],
        ["workforce", "Workforce economics", `${root}/pages/workforce.html`, "WF"],
        ["housing-parity", "Housing parity", `${root}/pages/housing-parity.html`, "HP"],
        ["housing", "Sector 22D", `${root}/pages/housing-22d.html`, "22"]
      ]
    },
    {
      label: "Delivery and context",
      routes: [
        ["infrastructure", "Infrastructure", `${root}/pages/infrastructure.html`, "IN"],
        ["timeline", "Timeline", `${root}/pages/timeline.html`, "TL"],
        ["clusters", "Special clusters", `${root}/pages/clusters.html`, "CL"]
      ]
    },
    {
      label: "Evidence and product",
      routes: [
        ["calculator", "Tools · Returns", `${root}/pages/calculator.html`, "IR"],
        ["request", "Request evidence", `${root}/pages/request.html`, "RQ"],
        ["methodology", "Methodology", `${root}/pages/methodology.html`, "ME"],
        ["audit", "Coverage audit", `${root}/pages/audit.html`, "AU"],
        ["roadmap", "Enhancement roadmap", `${root}/pages/roadmap.html`, "RM"]
      ]
    }
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function stageMeta(key) {
    return [...data.stages, ...(data.infraStages || [])].find((stage) => stage.key === key) ||
      { label: key || "Unknown", tone: "muted" };
  }

  function stageBadge(key) {
    const stage = stageMeta(key);
    return `<span class="badge badge-${escapeHtml(stage.tone)}">${escapeHtml(stage.label)}</span>`;
  }

  function sourceBadge(strength, confidence) {
    return `<span class="source-strength">${escapeHtml(strength || "Source ungraded")}</span>
      <span class="confidence">${escapeHtml(confidence || "UNVERIFIED")}</span>`;
  }

  function entityLink(record, collection, labelKey) {
    const label = record[labelKey] || record.name || record.plot || record.company || record.id;
    return `<a class="entity-link" href="${root}/pages/detail.html?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(record.id)}&market=${encodeURIComponent(activeMarket)}">${escapeHtml(label)}</a>`;
  }

  function navigationMarkup() {
    return navGroups.map((group) => `
      <section class="nav-group">
        <h2>${escapeHtml(group.label)}</h2>
        ${group.routes.map(([key, label, url, token]) =>
          `<a class="nav-link ${page === key ? "active" : ""}" href="${marketUrl(url)}"
             ${page === key ? 'aria-current="page"' : ""} aria-label="${escapeHtml(label)}">
            <span class="nav-token" aria-hidden="true">${escapeHtml(token)}</span>
            <span class="nav-label">${escapeHtml(label)}</span>
          </a>`
        ).join("")}
      </section>`
    ).join("");
  }

  function renderHeader() {
    const header = document.getElementById("site-header");
    header.innerHTML = `
      <a class="skip-link" href="#page-content">Skip to main content</a>
      <div class="brandbar">
        <button id="mobile-nav-trigger" type="button" class="mobile-nav-trigger"
                aria-controls="mobile-navigation" aria-expanded="false">
          <span aria-hidden="true">☰</span> Menu
        </button>
        <a class="brand" href="${marketUrl(`${root}/index.html`)}">
          <span class="brand-mark">RP</span>
          <span><strong>${escapeHtml(data.meta.brand)}</strong><small>${escapeHtml(data.meta.edition)} · Evidence beats hype</small></span>
        </a>
        <label class="market-switcher">City
          <select id="market-filter" aria-label="Select city market">
            ${marketRegistry.markets.map((market) =>
              `<option value="${escapeHtml(market.id)}" ${market.id === activeMarket ? "selected" : ""}>${escapeHtml(market.label)}</option>`
            ).join("")}
          </select>
        </label>
        <div class="as-of">As of ${escapeHtml(data.meta.asOf)}</div>
      </div>
      <div class="header-search-wrap">${globalSearchMarkup(true)}</div>`;
    header.insertAdjacentHTML("afterend", `
      <aside id="desktop-navigation" class="site-sidebar">
        <div class="sidebar-heading">
          <strong>Navigation</strong>
          <button id="sidebar-density" type="button" aria-pressed="false">Compact</button>
        </div>
        <nav aria-label="Primary navigation">${navigationMarkup()}</nav>
      </aside>
      <dialog id="mobile-navigation" class="mobile-navigation" aria-labelledby="mobile-navigation-title">
        <div class="mobile-navigation-shell">
          <div class="mobile-navigation-heading">
            <h2 id="mobile-navigation-title">Navigation</h2>
            <button id="mobile-nav-close" type="button">Close</button>
          </div>
          <nav aria-label="Primary navigation">${navigationMarkup()}</nav>
        </div>
      </dialog>`);
    header.insertAdjacentHTML("beforeend", `
      <nav class="mobile-tabbar" aria-label="Mobile primary navigation">
        <a href="${marketUrl(`${root}/index.html`)}" class="${page === "home" ? "active" : ""}" ${page === "home" ? 'aria-current="page"' : ""}>Home</a>
        <a href="${marketUrl(`${root}/pages/projects.html`)}" class="${page === "projects" ? "active" : ""}" ${page === "projects" ? 'aria-current="page"' : ""}>Projects</a>
        <a href="${marketUrl(`${root}/pages/map.html`)}" class="${page === "map" ? "active" : ""}" ${page === "map" ? 'aria-current="page"' : ""}>Map</a>
        <a href="${marketUrl(`${root}/pages/compare.html`)}" class="${page === "compare" ? "active" : ""}" ${page === "compare" ? 'aria-current="page"' : ""}>Saved</a>
        <button type="button" data-open-more>More</button>
      </nav>`);
    body.classList.add("has-sidebar");

    const densityButton = document.getElementById("sidebar-density");
    let compact = false;
    try {
      compact = localStorage.getItem("realtyproof-sidebar-compact") === "true";
    } catch {
      compact = false;
    }
    const applyCompact = (value) => {
      compact = value;
      body.classList.toggle("sidebar-compact", compact);
      densityButton?.setAttribute("aria-pressed", String(compact));
      if (densityButton) densityButton.textContent = compact ? "Expand" : "Compact";
      try {
        localStorage.setItem("realtyproof-sidebar-compact", String(compact));
      } catch {
        // Navigation still works when storage is unavailable.
      }
    };
    applyCompact(compact);
    densityButton?.addEventListener("click", () => applyCompact(!compact));

    const mobileTrigger = document.getElementById("mobile-nav-trigger");
    const mobileDialog = document.getElementById("mobile-navigation");
    const marketFilter = document.getElementById("market-filter");
    const closeMobileNavigation = () => {
      if (mobileDialog?.open) mobileDialog.close();
    };
    mobileTrigger?.addEventListener("click", () => {
      mobileDialog?.showModal();
      mobileTrigger.setAttribute("aria-expanded", "true");
      if (marketFilter) marketFilter.disabled = true;
      const current = mobileDialog?.querySelector('[aria-current="page"]');
      (current || mobileDialog?.querySelector("a"))?.focus();
    });
    document.getElementById("mobile-nav-close")?.addEventListener("click", closeMobileNavigation);
    document.querySelector("[data-open-more]")?.addEventListener("click", () => mobileTrigger?.click());
    mobileDialog?.addEventListener("click", (event) => {
      if (event.target === mobileDialog) closeMobileNavigation();
    });
    mobileDialog?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.stopPropagation();
    });
    mobileDialog?.addEventListener("close", () => {
      mobileTrigger?.setAttribute("aria-expanded", "false");
      if (marketFilter) marketFilter.disabled = false;
      mobileTrigger?.focus();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 1200) closeMobileNavigation();
    });

    document.getElementById("market-filter")?.addEventListener("change", (event) => {
      const url = new URL(window.location.href);
      url.searchParams.set("market", event.target.value);
      if (page === "map") {
        ["authority", "category", "categories", "search", "status"].forEach((key) =>
          url.searchParams.delete(key)
        );
      }
      window.location.assign(url.toString());
    });
  }

  function renderFooter() {
    document.getElementById("site-footer").innerHTML = `
      <p>${escapeHtml(activeMarketDefinition.scope)}</p>
      <p><strong>Coverage warning:</strong> ${escapeHtml(activeMarketDefinition.completeness)}</p>`;
  }

  function hero(title, deck, kicker) {
    return `<section class="hero">
      <p class="kicker">${escapeHtml(kicker)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="deck">${escapeHtml(deck)}</p>
      <div class="status-line"><span class="pulse"></span>${escapeHtml(data.meta.status)}</div>
    </section>`;
  }

  function stat(label, value, note) {
    return `<article class="stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>`;
  }

  function emptyState(message) {
    return `<div class="empty-state"><strong>Evidence ledger is being populated.</strong><p>${escapeHtml(message)}</p></div>`;
  }

  function marketUnavailable(topic) {
    return `${hero(
      `${topic}: ${activeMarketDefinition.label}`,
      "This market view will not reuse YEIDA-only assumptions or metrics without city-specific primary evidence.",
      "Evidence gap"
    )}
    <section class="panel callout">
      <h2>City-specific dataset not yet published</h2>
      <p>${escapeHtml(activeMarketDefinition.completeness)}</p>
      <p>Use the map and currently attributed company, infrastructure and timeline records while the dedicated housing, deed and workforce ledgers are acquired.</p>
    </section>`;
  }

  function projectMatches(project, query) {
    if (!query) return true;
    const searchable = [
      project.projectName,
      project.reraNumber,
      project.location,
      project.marketLabel,
      project.legalPromoter,
      ...project.reraFacts.flatMap((fact) => [
        reraFactLabels[fact.semanticFactType],
        fact.reportingQuarter,
        fact.caveat
      ]),
      ...project.sources.map((source) => source.publisher)
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    return searchable.includes(query.toLocaleLowerCase());
  }

  function projectCard(project) {
    const selected = readWatchlist();
    const source = project.sources[0];
    const saved = selected.savedProjects.includes(project.id);
    const compared = selected.projects.includes(project.id);
    return `<article class="project-card" data-project-card data-project-id="${escapeHtml(project.id)}">
      <div class="project-card-heading">
        <div>
          <span class="badge badge-watch">PARTIAL · ${escapeHtml(project.phase)}</span>
          <h2>${escapeHtml(project.projectName)}</h2>
        </div>
        <span class="confidence">${escapeHtml(project.confidence)} confidence</span>
      </div>
      <p class="project-location">${escapeHtml(project.location)} · ${escapeHtml(project.marketLabel)}</p>
      <dl class="project-facts">
        <div><dt>RERA</dt><dd>${escapeHtml(project.reraNumber || "Unavailable")}</dd></div>
        <div><dt>Published promoter</dt><dd>${escapeHtml(project.legalPromoterLabel)}</dd></div>
        <div><dt>Delivery evidence</dt><dd>${escapeHtml(project.delivery)}</dd></div>
        <div><dt>Known price / cost</dt><dd>${escapeHtml(project.price)}</dd></div>
        <div><dt>Reviewed RERA facts</dt><dd>${project.reraFacts.length
          ? `<a class="entity-link" href="${projectUrl(project.id)}#rera-facts">${escapeHtml(project.reraFactSummary)}</a>`
          : "Unavailable"}</dd></div>
        <div><dt>Evidence coverage</dt><dd>${escapeHtml(project.evidenceLabel)}</dd></div>
        <div><dt>Freshness</dt><dd>Verified ${escapeHtml(project.lastVerified)}</dd></div>
      </dl>
      ${project.legalPromoterLabel !== "Unavailable"
        ? "<p class=\"data-note\">Published promoter is not a group/SPV, financial-strength or delivery finding.</p>"
        : ""}
      <p><strong>Main gap / risk:</strong> ${escapeHtml(project.criticalMissing[0] || project.ratingReason)}</p>
      <p class="data-note">Rating: NR · Not Rated. ${escapeHtml(project.ratingReason)}</p>
      <div class="project-actions">
        <a class="button-link" href="${projectUrl(project.id)}">View proof</a>
        <a class="button-link" href="${marketUrl(`${root}/pages/calculator.html?project=${encodeURIComponent(project.id)}`)}">Model returns</a>
        <button type="button" class="watch-toggle" data-project-save="${escapeHtml(project.id)}" aria-pressed="${saved}">
          ${saved ? "Saved" : "Save"}
        </button>
        <button type="button" class="watch-toggle" data-compare-project="${escapeHtml(project.id)}" aria-pressed="${compared}">
          ${compared ? "In compare" : "Compare"}
        </button>
      </div>
      ${source ? `<p class="data-note">Identity source: <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.publisher)}</a> · ${escapeHtml(source.date)}</p>` : ""}
    </article>`;
  }

  function projectSearchState() {
    const params = new URLSearchParams(window.location.search);
    return {
      q: params.get("q") || "",
      filter: params.get("filter") || "all",
      sort: params.get("sort") || "recent",
      market: params.get("market") || activeMarket
    };
  }

  function renderProjectResults() {
    const state = projectSearchState();
    let projects = projectCatalog().filter((project) => projectMatches(project, state.q));
    if (state.filter === "missing") {
      projects = projects.filter((project) => project.criticalMissing.length);
    }
    if (state.filter === "identity") {
      projects = projects.filter((project) => project.reraNumber);
    }
    if (state.filter === "rera-facts") {
      projects = projects.filter((project) => project.reraFacts.length);
    }
    if (state.sort === "name") {
      projects.sort((a, b) => a.projectName.localeCompare(b.projectName));
    } else {
      projects.sort((a, b) => String(b.lastVerified).localeCompare(String(a.lastVerified)));
    }
    const summary = projects.length
      ? `<p class="results-summary">${projects.length} published ${projects.length === 1 ? "record" : "records"} · ${state.q ? `matching “${escapeHtml(state.q)}”` : "recently updated first"}</p>`
      : `<div class="empty-state"><strong>No published project record matches.</strong><p>Try the exact RERA number, a partial project name, sector or city. Legal-promoter and builder evidence is unavailable for these records, so a missing result is not a negative finding.</p><a class="entity-link" href="${marketUrl(`${root}/pages/map.html`)}">Browse the available map evidence →</a></div>`;
    return `${summary}${projects.length ? `<div class="project-grid">${projects.map(projectCard).join("")}</div>` : ""}`;
  }

  function renderProjects() {
    const state = projectSearchState();
    return `${hero(
      "Projects, with proof before pitch.",
      "This is a partial static index. Results contain only published records; unavailable fields are not estimates.",
      `${activeMarketDefinition.shortLabel} project evidence`
    )}
    <section class="panel project-search-panel">
      <form data-project-filters>
        <label>Search project, RERA, legal promoter, builder, sector or market
          <input name="q" type="search" value="${escapeHtml(state.q)}" placeholder="e.g. UPRERAPRJ313638 or Sector 1">
        </label>
        <div class="filter-row">
          <label>Evidence state
            <select name="filter">
              <option value="all" ${state.filter === "all" ? "selected" : ""}>All published records</option>
              <option value="identity" ${state.filter === "identity" ? "selected" : ""}>RERA identity published</option>
              <option value="rera-facts" ${state.filter === "rera-facts" ? "selected" : ""}>Reviewed RERA facts linked</option>
              <option value="missing" ${state.filter === "missing" ? "selected" : ""}>Critical evidence missing</option>
            </select>
          </label>
          <label>Sort
            <select name="sort">
              <option value="recent" ${state.sort === "recent" ? "selected" : ""}>Recently updated evidence</option>
              <option value="name" ${state.sort === "name" ? "selected" : ""}>Project name</option>
            </select>
          </label>
          <button type="submit">Apply</button>
        </div>
      </form>
      <p class="data-note">Market: ${escapeHtml(activeMarketDefinition.label)}. Budget, possession and property-type filters are unavailable until their source fields are published.</p>
    </section>
    <section data-project-results aria-live="polite">${renderProjectResults()}</section>
    <section class="panel callout">
      <h2>Partial is a valid result.</h2>
      <p>Reviewed QPR facts appear only where explicitly linked. All-in buyer costs, OC/CC, independent construction evidence and comparable deeds remain unavailable unless separately published. No project is recommended or ranked.</p>
    </section>`;
  }

  function renderHome() {
    const ratings = data.launchRatings;
    const queue = ratings.researchQueue.filter((launch) =>
      launch.marketIds.includes(activeMarket)
    );
    const sourceMap = new Map(rawData.sources.map((source) => [source.id, source]));
    return `${hero(
      "Check the evidence before trusting the pitch.",
      "Search a published project record, inspect its proof and sources, then save or compare what is actually known.",
      `${activeMarketDefinition.shortLabel} buyer-first evidence`
    )}
    ${globalSearchMarkup()}
    <section class="home-actions" aria-label="Start researching">
      <a class="button-link" href="${marketUrl(`${root}/pages/projects.html`)}">Browse projects</a>
      <a class="button-link secondary" href="${marketUrl(`${root}/pages/map.html`)}">Open map</a>
    </section>
    <section class="panel">
      <p class="eyebrow">Projects under review</p>
      <h2>Published identities awaiting sufficient evidence</h2>
      ${queue.length ? `<div class="launch-grid">${queue.map((launch) => {
        const sources = launch.sourceIds.map((sourceId) => sourceMap.get(sourceId)).filter(Boolean);
        return `<article class="launch-card">
          <div class="launch-card-heading">
            <div><span class="badge badge-watch">${escapeHtml(launch.ratingStatus)} · Not Rated</span>
              <h3>${escapeHtml(launch.projectName)}</h3></div>
            <span class="confidence">${escapeHtml(launch.confidence)} confidence</span>
          </div>
          <p>${escapeHtml(launch.location)} · ${escapeHtml(launch.reraNumber)}</p>
          <p><strong>Why not rated:</strong> ${escapeHtml(launch.ratingReason)}</p>
          <details><summary>Critical evidence still required</summary>
            <ul>${launch.criticalMissing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </details>
          <p class="data-note">Last verified ${escapeHtml(launch.lastVerified)} · ${sources.map((source) =>
            `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.publisher)}</a>`
          ).join(" · ")}</p>
          ${watchButton("projects", launch.id)}
        </article>`;
      }).join("")}</div>` : emptyState(`No launch in ${activeMarketDefinition.label} has passed even the research-queue identity gate.`)}
    </section>
    <section class="stats-grid">
      ${stat("Top Rated", ratings.topRated.length, "No forced Top 5")}
      ${stat("Research queue", queue.length, "Identity verified; rating evidence incomplete")}
      ${stat("Minimum coverage", "85%", "Plus every critical gate")}
      ${stat("Methodology", ratings.methodologyVersion, "Conservative lower-bound scoring")}
    </section>
    <section class="panel callout">
      <p class="eyebrow">Why no project is rated yet</p>
      <h2>${escapeHtml(ratings.headline)}</h2>
      <p>${escapeHtml(ratings.minimumGate)}</p>
      <p>Paid placement cannot create, improve or reorder an organic rating. An empty qualified list is a valid outcome.</p>
    </section>
    <section class="panel">
      <p><a class="entity-link" href="${marketUrl(`${root}/pages/about.html`)}">Read the RealtyProof AI overview and evidence philosophy →</a></p>
    </section>`;
  }

  function renderAbout() {
    const operational = data.companies.filter((item) => item.stage === "operational").length;
    const construction = data.companies.filter((item) => item.stage === "construction").length;
    const softInterest = data.interestEvents.filter((item) =>
      ["interest", "mou", "loi"].includes(item.stage)
    ).length;
    const oneMap = data.regionalContext.gnidaOneMap;
    const noidaMap = data.regionalContext.noidaOneMap;
    return `${hero(
      "What is real, what is committed, and what is only a plan?",
      `A homebuyer-first examination of land conversion, employers and infrastructure for ${activeMarketDefinition.label}.`,
      `${activeMarketDefinition.shortLabel} investment conversion tracker`
    )}
    <section class="stats-grid">
      ${stat("Operational employers", operational, "Facility-level evidence only")}
      ${stat("Under construction", construction, "Physical execution observed")}
      ${stat("Soft pipeline", softInterest, "Interest, MoUs and conditional LOIs")}
      ${stat("Sources logged", data.sources.length, "Every material claim links to evidence")}
    </section>
    <section class="two-column">
      <article class="panel">
        <p class="eyebrow">Core rule</p>
        <h2>Reserved land creates zero jobs</h2>
        <p>An authority-designated sector remains contextual until a named counterparty reaches a verifiable commitment milestone.</p>
        <div class="stage-flow">${data.stages.map((item) => stageBadge(item.key)).join("")}</div>
      </article>
      <article class="panel callout">
        <p class="eyebrow">Buyer question</p>
        <h2>Can jobs support 2029-2031 housing prices?</h2>
        <p>The model counts operational employment first, construction-stage capacity second, and discounts everything else for execution and timing risk.</p>
      </article>
    </section>
    <section class="panel">
      <p class="eyebrow">Current market coverage</p>
      <h2>${escapeHtml(activeMarketDefinition.label)} evidence is filtered, not inferred</h2>
      <p>${escapeHtml(activeMarketDefinition.completeness)}</p>
    </section>
    <section class="panel">
      <p class="eyebrow">Official regional GIS connected</p>
      <h2>Noida and Greater Noida OneMap are core sources</h2>
      <p>Noida's live and snapshot counts match at ${escapeHtml(noidaMap.livePlotCount.toLocaleString("en-IN"))} plots. GNIDA's live layer exposes ${escapeHtml(oneMap.livePlotCount.toLocaleString("en-IN"))}, versus ${escapeHtml(oneMap.snapshotPlotCount.toLocaleString("en-IN"))} in the ${escapeHtml(oneMap.snapshotDate)} snapshot; the five-record difference remains a reconciliation warning.</p>
      <p><strong>Privacy boundary:</strong> ${escapeHtml(oneMap.privacyNote)}</p>
    </section>`;
  }

  function table(headers, rows) {
    if (!rows.length) {
      return emptyState("No verified rows have been published to this section yet.");
    }
    return `<div class="table-wrap"><table><thead><tr>${headers.map((header) =>
      `<th>${escapeHtml(header.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) =>
      `<tr>${headers.map((header) => `<td>${header.render ? header.render(row) : escapeHtml(row[header.key])}</td>`).join("")}</tr>`
    ).join("")}</tbody></table></div>`;
  }

  function renderLand() {
    const oneMap = data.regionalContext.gnidaOneMap;
    const noidaMap = data.regionalContext.noidaOneMap;
    const operational = data.plots.filter((item) => item.stage === "operational").length;
    const failed = data.plots.filter((item) => item.stage === "failed").length;
    return `${hero(
      "Land allotments and plot event histories",
      "Allotment, lease, possession and operation are tracked separately. Failed and re-allotted parcels remain visible.",
      `${activeMarketDefinition.shortLabel} land evidence ledger`
    )}
    <section class="stats-grid">
      ${stat("Verified partial records", data.plots.length, "Not an all-time complete register")}
      ${stat("Operational", operational, "Facility or concession evidence")}
      ${stat("Failed / cancelled", failed, "Retained in plot history")}
      ${stat("Completeness", "Partial", "RTI/export required for every plot")}
    </section>
    <section class="panel callout">
      <p class="eyebrow">Material limitation</p>
      <h2>No authority publishes one reconciled all-time transaction ledger.</h2>
      <p>This market view includes only records attributed through public authority, regulatory, statutory or credible secondary evidence. Older scanned lists, transfers and lifecycle events remain incomplete.</p>
    </section>
    <section class="panel filter-panel">
      <label>Filter plots <input id="land-filter" type="search" placeholder="Company, sector, use or status"></label>
    </section>
    <section class="panel" id="land-table">
      ${table([
        { label: "Plot", render: (row) => entityLink(row, "plots", "plot") },
        { label: "Allottee", key: "allottee" },
        { label: "Use", key: "use" },
        { label: "Stage", render: (row) => stageBadge(row.stage) },
        { label: "Evidence", render: (row) => sourceBadge(row.sourceStrength, row.confidence) }
      ], data.plots)}
    </section>
    ${["gbn", "noida"].includes(activeMarket) ? `<section class="panel">
      <p class="eyebrow">Noida context from official OneMap</p>
      <h2>Operational city context for employment and comparables</h2>
      ${table([
        { label: "Land use", key: "use" },
        { label: "Plots", render: (row) => escapeHtml(row.plots.toLocaleString("en-IN")) },
        { label: "Mapped area (sq km)", key: "areaSqKm" }
      ], noidaMap.nonIndividualLand)}
      <p class="data-note"><strong>Allotment status:</strong> ${escapeHtml(noidaMap.recordedAllottedPlots.toLocaleString("en-IN"))} plots were recorded as allotted; ${escapeHtml(noidaMap.statusUnknownPlots.toLocaleString("en-IN"))} were unknown/unrecorded.</p>
      <p class="data-note"><strong>Named-allottee limitation:</strong> ${escapeHtml(noidaMap.limitation)}</p>
    </section>` : ""}
    ${["gbn", "greater-noida"].includes(activeMarket) ? `<section class="panel">
      <p class="eyebrow">Greater Noida context from official OneMap</p>
      <h2>Land-use supply is context, not company demand</h2>
      ${table([
        { label: "Land use", key: "use" },
        { label: "Plots", render: (row) => escapeHtml(row.plots.toLocaleString("en-IN")) },
        { label: "Mapped area (sq km)", key: "areaSqKm" }
      ], oneMap.nonIndividualLand)}
      <p class="data-note"><strong>Allotment status:</strong> ${escapeHtml(oneMap.recordedAllottedPlots.toLocaleString("en-IN"))} plots were recorded as allotted in the snapshot; ${escapeHtml(oneMap.statusUnknownPlots.toLocaleString("en-IN"))} were unrecorded/unknown, which must not be interpreted as vacant.</p>
      <p class="data-note"><strong>Named-allottee limitation:</strong> ${escapeHtml(oneMap.limitation)}</p>
    </section>` : ""}
    <section class="panel">
      <p class="eyebrow">Official-data gap</p>
      <h2>What the authority export must contain</h2>
      <p>Permanent plot ID, sector/GIS geometry, legal entity and CIN, scheme, rate, payment, allotment, lease, possession, building-plan, environmental, completion/occupancy, mortgage, transfer, sublease, dues, cancellation, restoration, surrender and re-allotment events—with supporting order numbers.</p>
    </section>`;
  }

  function renderMap() {
    const regional = window.REGIONAL_MAP_DATA || { sectors: [], landUseClusters: [] };
    const plotManifest = window.LIVE_PLOT_MANIFEST || { layers: [], generatedAt: null };
    const yeidaMap = data.regionalContext.yeidaOneMap;
    const regionalMapped = regional.sectors.length + regional.landUseClusters.length;
    const availablePlotPolygons = plotManifest.layers.reduce((sum, layer) => sum + layer.count, 0);
    const yeidaPlotPolygons = plotManifest.layers
      .filter((layer) => layer.authority === "yeida")
      .reduce((sum, layer) => sum + layer.count, 0);
    const projectSuggestions = [...new Set(data.reraYeidaPlotMappings.flatMap((mapping) => [
      mapping.projectName,
      mapping.promoterLegalEntity,
      mapping.promoterRegistryLabel
    ]).concat(parityUnresolvedSearchValues()).filter(Boolean))].sort();
    function parityUnresolvedSearchValues() {
      if (!["gbn", "yeida"].includes(activeMarket)) return [];
      return (data.housingParity.unresolvedDeveloperClaims || []).flatMap((claim) => [
        claim.searchName,
        claim.marketingName
      ]);
    }
    const projectDirectory = data.reraYeidaPlotMappings.filter((mapping) => mapping.mapPublish);
    return `${hero(
      "Interactive evidence map",
      "Operational facilities, committed investments, soft announcements, housing and infrastructure remain separate layers.",
      "Geography with execution status"
    )}
    <section class="stats-grid map-stats">
      ${stat("Live plot polygons", availablePlotPolygons.toLocaleString("en-IN"), "Noida/GNIDA/YEIDA official GIS")}
      ${stat("YEIDA polygons", yeidaPlotPolygons.toLocaleString("en-IN"), "Plots, sectors and master-plan areas")}
      ${stat("Regional centroids", regionalMapped, "Noida/GNIDA overview context")}
      ${stat("Live plot refresh", plotManifest.generatedAt ? new Date(plotManifest.generatedAt).toLocaleDateString("en-IN") : "Unavailable", "Official OneMap query time")}
    </section>
    <section class="panel plot-explorer-controls">
      <div class="control-heading">
        <div>
          <p class="eyebrow">Clickable plot explorer</p>
          <h2>${escapeHtml(activeMarketDefinition.label)} official polygons</h2>
        </div>
        <span id="plot-load-status" class="status-pill" role="status" aria-live="polite">Ready</span>
      </div>
      <div class="map-shortcuts primary-map-shortcuts" role="group" aria-label="Primary map presets">
        <button type="button" data-map-authority="all" data-map-category="industrial">All GBN industrial · 18,476</button>
        <button type="button" data-map-authority="yeida" data-map-category="industrial">YEIDA industrial · 3,503</button>
        <button type="button" data-map-authority="yeida" data-map-category="residential">YEIDA residential · 30,759</button>
        <button type="button" data-map-authority="yeida" data-map-categories="__all__">All YEIDA land uses</button>
      </div>
      <details class="more-presets">
        <summary>More map presets</summary>
        <div class="map-shortcuts" role="group" aria-label="More map presets">
        <button type="button" data-map-authority="yeida" data-map-categories="industrial,commercial,institutional">YEIDA jobs mix</button>
        <button type="button" data-map-authority="yeida" data-map-category="rera-project-parcels">RERA project parcels</button>
        <button type="button" data-map-authority="yeida" data-map-category="sector-boundaries">YEIDA sectors · 99</button>
        <button type="button" data-map-authority="yeida" data-map-category="sector-boundaries" data-map-search="22D">Find Sector 22D</button>
        <button type="button" data-map-authority="yeida" data-map-category="rera-project-parcels" data-map-search="Purvanchal">Purvanchal plots</button>
        <button type="button" data-map-authority="yeida" data-map-category="rera-project-parcels" data-map-search="ACE">ACE plots</button>
        <button type="button" data-map-authority="yeida" data-map-category="rera-project-parcels" data-map-search="Eldeco">Eldeco plots</button>
        <button type="button" data-map-authority="yeida" data-map-category="rera-project-parcels" data-map-search="Gaur">Gaur plots</button>
        <button type="button" data-map-authority="yeida" data-map-category="rera-project-parcels" data-map-search="County">County claim check</button>
        <button type="button" data-map-authority="gnida" data-map-category="group-housing">GNIDA group housing · 97</button>
        <button type="button" data-map-authority="noida" data-map-category="industrial">Noida industrial · 12,022</button>
        </div>
      </details>
      <div id="active-layer-summary" class="active-layer-summary" aria-live="polite">
        <strong>YEIDA · industrial</strong>
        <span>Loading 3,503 official clickable polygons</span>
      </div>
      <div class="plot-filter-grid">
        <label>Authority
          <select id="plot-authority">
            <option value="all">GBN Overview (all authorities)</option>
            <option value="yeida" selected>YEIDA</option>
            <option value="gnida">Greater Noida (GNIDA)</option>
            <option value="noida">Noida</option>
          </select>
        </label>
        <div class="land-use-filter">
          <span id="land-use-label" class="filter-label">Land uses</span>
          <details id="land-use-dropdown" class="multi-select-dropdown">
            <summary id="land-use-summary" aria-controls="land-use-options" aria-describedby="land-use-help">Industrial</summary>
            <div id="land-use-options" class="multi-select-options">
              <label><input type="checkbox" value="__all__"> All available land uses</label>
              <label><input type="checkbox" value="group-housing"> Group housing</label>
              <label><input type="checkbox" value="industrial" checked> Industrial</label>
              <label><input type="checkbox" value="commercial"> Commercial</label>
              <label><input type="checkbox" value="institutional"> Institutional</label>
              <label><input type="checkbox" value="residential"> Residential plots</label>
              <label><input type="checkbox" value="it-ites"> IT / ITES</label>
              <label><input type="checkbox" value="logistics"> Logistics</label>
              <label><input type="checkbox" value="mixed-use"> Mixed use</label>
              <label><input type="checkbox" value="airport-aviation"> Airport and aviation</label>
              <label><input type="checkbox" value="special-development"> Special development zone</label>
              <label><input type="checkbox" value="riverfront"> Riverfront</label>
              <label><input type="checkbox" value="hospitality"> Hospitality</label>
              <label><input type="checkbox" value="rera-project-parcels"> RERA project parcels</label>
              <label><input type="checkbox" value="sector-boundaries"> YEIDA sector boundaries</label>
              <label><input type="checkbox" value="residential-masterplan"> YEIDA residential master plan</label>
              <label><input type="checkbox" value="airport-masterplan"> YEIDA airport master plan</label>
              <label><input type="checkbox" value="logistics-masterplan"> YEIDA logistics master plan</label>
              <label><input type="checkbox" value="hospitality-masterplan"> YEIDA hospitality master plan</label>
              <label><input type="checkbox" value="roads-masterplan"> YEIDA roads master plan</label>
            </div>
          </details>
          <select id="plot-category" multiple hidden aria-hidden="true">
            <option value="__all__">All available land uses</option>
            <option value="group-housing">Group housing</option>
            <option value="industrial" selected>Industrial</option>
            <option value="commercial">Commercial</option>
            <option value="institutional">Institutional</option>
            <option value="residential">Residential plots</option>
            <option value="it-ites">IT / ITES</option>
            <option value="logistics">Logistics</option>
            <option value="mixed-use">Mixed use</option>
            <option value="airport-aviation">Airport and aviation</option>
            <option value="special-development">Special development zone</option>
            <option value="riverfront">Riverfront</option>
            <option value="hospitality">Hospitality</option>
            <option value="rera-project-parcels">RERA project parcels</option>
            <option value="sector-boundaries">YEIDA sector boundaries</option>
            <option value="residential-masterplan">YEIDA residential master plan</option>
            <option value="airport-masterplan">YEIDA airport master plan</option>
            <option value="logistics-masterplan">YEIDA logistics master plan</option>
            <option value="hospitality-masterplan">YEIDA hospitality master plan</option>
            <option value="roads-masterplan">YEIDA roads master plan</option>
          </select>
          <small id="land-use-help" class="sr-only">Select one or more checkboxes; the menu closes when you click outside or apply.</small>
        </div>
        <label>Status
          <select id="plot-status">
            <option value="">All statuses</option>
            ${executionStages.map((stage) =>
              `<option value="${escapeHtml(stage.key)}">${escapeHtml(stage.label)}</option>`
            ).join("")}
          </select>
        </label>
        <button id="load-plots" type="button">Apply filters</button>
        <label class="map-search-field">Find plot, project or developer
          <input id="plot-search" type="search" list="plot-search-suggestions" placeholder="Eldeco, ACE Terra, GH-12, Sector 22D">
          <datalist id="plot-search-suggestions">
            ${projectSuggestions.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("")}
          </datalist>
        </label>
        <button id="search-plots" type="button" class="secondary-button">Find</button>
        <button id="reset-map" type="button" class="secondary-button">Reset</button>
      </div>
      <details id="plot-legend-panel" class="plot-legend-panel">
        <summary>Legend</summary>
        <div id="plot-legend" class="plot-legend"></div>
      </details>
      <p id="plot-coverage-note" class="data-note">Default: 3,503 current YEIDA industrial polygons. The full 30,759-parcel residential geometry is available with identifiers and status fields; all natural-person allottee/contact/address fields are excluded.</p>
    </section>
    <section class="panel map-panel">
      <p id="map-instructions" class="sr-only">Use the filters above to load official polygons. Search to select a mapped feature. Keyboard users can use the synchronized search and detail panel.</p>
      <div id="reality-map" tabindex="0" aria-label="Interactive property evidence map" aria-describedby="map-instructions"></div>
      <aside id="plot-detail-panel" class="plot-detail-panel" role="region" aria-label="Selected map feature details">
        <button id="close-plot-detail" type="button" class="plot-detail-close" aria-label="Close selected plot details">Close</button>
        <p class="eyebrow">Selected map feature</p>
        <h3>Click a polygon</h3>
        <p>Its official GIS identifiers, use, size, scheme and allotment-status fields will appear here.</p>
      </aside>
    </section>
    <section class="panel">
      <p class="eyebrow">Named developer parcel directory</p>
      <h2>${projectDirectory.length} published RERA-to-YEIDA project records</h2>
      <p class="data-note">Use this directory when the authority residential GIS does not expose the developer name. Shared township parcels are clearly marked as parent-parcel matches.</p>
      ${table([
        { label: "Project", key: "projectName" },
        { label: "Developer legal entity", render: (row) => escapeHtml(row.promoterLegalEntity || row.promoterRegistryLabel) },
        { label: "Sector", key: "sector" },
        { label: "YEIDA plot", key: "gisPlotIdentifier" },
        { label: "RERA", key: "reraNumber" },
        { label: "Completion", key: "completionDate" },
        { label: "Mapping", render: (row) => `${escapeHtml(row.matchMethod.replaceAll("_", " "))}<br><span class="data-note">${escapeHtml(row.matchScope)}</span>` },
        { label: "Confidence", key: "confidence" },
        { label: "Map", render: (row) => `<a class="entity-link" href="${root}/pages/map.html?market=yeida&authority=yeida&categories=rera-project-parcels&search=${encodeURIComponent(row.projectName)}">Show and highlight</a>` }
      ], projectDirectory)}
      <h3>Claimed developer names without a verified plot</h3>
      ${table([
        { label: "Search name", key: "searchName" },
        { label: "Marketing name", key: "marketingName" },
        { label: "Claimed location", key: "claimedLocation" },
        { label: "Status", key: "status" },
        { label: "Official finding", key: "finding" },
        { label: "Checked", key: "lastChecked" }
      ], data.housingParity.unresolvedDeveloperClaims)}
    </section>
    <section class="panel">
      <p class="eyebrow">Completeness warning</p>
      <h2>GIS status is not legal title</h2>
      <p>The map contains official live plot/planning polygons plus Noida/GNIDA sector centroids. A planning polygon, allotment-status field or sector boundary is not a title certificate, current ownership record or proof of operation.</p>
      <p><strong>YEIDA OneMap:</strong> <a href="${escapeHtml(yeidaMap.citizenUrl)}" target="_blank" rel="noopener">${escapeHtml(yeidaMap.title)} citizen portal</a>. ${escapeHtml(yeidaMap.accessCheck)} Non-residential planning polygons are available in the clickable plot explorer; YEIDA residential records remain excluded pending a privacy-safe group-housing filter.</p>
    </section>`;
  }

  function renderCompanies() {
    const analysis = data.employmentAnalysis;
    const mdpAllottees = data.plots.filter((item) => item.mdpLedger && !item.recordType);
    const mdpGap = data.plots.find((item) => item.id === "plot-mdp-unresolved-remainder");
    const operating = data.companies.filter((item) => item.stage === "operational").length;
    const building = data.companies.filter((item) => item.stage === "construction").length;
    const landSecured = data.companies.filter((item) =>
      ["allotted", "possessed", "approved"].includes(item.stage)
    ).length;
    return `${hero(
      "Companies, jobs and the conversion funnel",
      "Facility-level employment is separated from parent-company scale and publicity employment promises.",
      "Who can create durable demand?"
    )}
    <section class="stats-grid">
      ${stat("Operating facilities", operating, "Serving customers or producing")}
      ${stat("Physical execution", building, "Construction or commissioning evidence")}
      ${stat("Land-secured pipeline", landSecured, "No substantial construction verified")}
      ${stat("Interest events", data.interestEvents.length, "LOIs, MoUs, outreach and failures")}
    </section>
    <section class="panel housing-verdict">
      <p class="eyebrow">Employment structure</p>
      <h2>${escapeHtml(analysis.headline)}</h2>
      <p><strong>Strongest current base:</strong> ${escapeHtml(analysis.strongestExisting)}</p>
      <p><strong>Strongest incremental pipeline:</strong> ${escapeHtml(analysis.strongestPipeline)}</p>
      <p><strong>Housing implication:</strong> ${escapeHtml(analysis.housingImplication)}</p>
      <div class="stage-flow">${analysis.cautions.map((item) => `<span class="badge badge-watch">${escapeHtml(item)}</span>`).join("")}</div>
    </section>
    <section class="panel filter-panel">
      <label>Filter companies <input id="company-filter" type="search" placeholder="Company, sector, activity or stage"></label>
    </section>
    <section class="panel">
      <div id="company-table">
      ${table([
        { label: "Company / facility", render: (row) => entityLink(row, "companies", "name") },
        { label: "What it does", render: (row) => escapeHtml(row.whatTheyDo || row.activity || "Not verified") },
        { label: "How big", render: (row) => escapeHtml(row.scaleEvidence || [row.capexClaim, row.localJobClaim].filter(Boolean).join("; ") || "Not verified") },
        { label: "Corridor intent", render: (row) => escapeHtml(row.corridorIntent || row.facilityName || row.currentState || "Not verified") },
        { label: "Stage", render: (row) => stageBadge(row.stage) },
        { label: "Job evidence", key: "jobEvidence" },
        { label: "Current state", key: "currentState" }
      ], data.companies)}
      </div>
    </section>
    <section class="panel">
      <p class="eyebrow">Medical Device Park legal-entity ledger</p>
      <h2>${escapeHtml(mdpAllottees.length)} named records, not one aggregate company</h2>
      <p>Each row preserves the strongest public milestone independently. A named allottee is not promoted to lease, possession, construction or operation without supporting evidence.</p>
      ${table([
        { label: "Reported allottee", render: (row) => entityLink(row, "plots", "allottee") },
        { label: "Legal-entity resolution", key: "legalEntity" },
        { label: "Plot / area", render: (row) => escapeHtml([row.plot, row.area].filter(Boolean).join(" · ")) },
        { label: "Product", key: "productMade" },
        { label: "Instrument", key: "schemeInstrument" },
        { label: "Lease deed", key: "leaseDeed" },
        { label: "Possession", key: "possession" },
        { label: "Plan approval", key: "buildingPlanApproval" },
        { label: "Construction / operation", render: (row) => escapeHtml([row.construction, row.commissioningOperation].filter(Boolean).join(" · ")) },
        { label: "Jobs claim", key: "jobsClaim" },
        { label: "Stage", render: (row) => stageBadge(row.stage) },
        { label: "Current state", key: "currentState" }
      ], mdpAllottees)}
      <p class="data-note"><strong>Unresolved remainder:</strong> ${escapeHtml(mdpGap?.currentState || "Current plot-to-company ledger unavailable.")}</p>
      <p><a class="entity-link" href="${root}/downloads/medical-device-park-allottees.csv" download>Download the full Medical Device Park allottee ledger →</a></p>
    </section>
    <section class="panel">
      <p class="eyebrow">Interest ledger</p>
      <h2>EOIs, MoUs and LOIs</h2>
      ${table([
        { label: "Company", render: (row) => entityLink(row, "interestEvents", "company") },
        { label: "What it does", render: (row) => escapeHtml(row.whatTheyDo || "Not verified") },
        { label: "How big", render: (row) => escapeHtml(row.scaleEvidence || row.proposedCapex || "Not verified") },
        { label: "Corridor intent", render: (row) => escapeHtml(row.corridorIntent || row.currentState || "Not verified") },
        { label: "Instrument", key: "instrument" },
        { label: "Date", key: "date" },
        { label: "Stage", render: (row) => stageBadge(row.stage) },
        { label: "Latest state", key: "currentState" }
      ], data.interestEvents)}
    </section>`;
  }

  function renderHousing() {
    if (!["gbn", "yeida"].includes(activeMarket)) {
      return marketUnavailable("Housing and transaction analysis");
    }
    const analysis = data.housingAnalysis;
    return `${hero(
      "Sector 22D: justified price or future-story premium?",
      "Projects are assessed against delivery, affordability, employment capture, infrastructure certainty, rental demand and exit liquidity.",
      "Housing reality check"
    )}
    <section class="panel housing-verdict">
      <p class="eyebrow">Current assessment</p>
      <h2>${escapeHtml(analysis.headline)}</h2>
      <div class="evidence-grid">
        <p><strong>Ready benchmark</strong>${escapeHtml(analysis.readyBenchmark)}</p>
        <p><strong>New launches</strong>${escapeHtml(analysis.newLaunchBand)}</p>
        <p><strong>Indicative advertised-rent yield</strong>${escapeHtml(analysis.currentYield)}</p>
        <p><strong>Working value band</strong>${escapeHtml(analysis.defensibleBand)}</p>
      </div>
      <p class="data-note"><strong>Critical gap:</strong> ${escapeHtml(analysis.deedGap)}</p>
      <p class="data-note"><strong>Yield formula:</strong> ${escapeHtml(analysis.yieldFormula)}</p>
      <p class="data-note"><strong>Valuation method:</strong> ${escapeHtml(analysis.valuationMethod)}</p>
    </section>
    <section class="score-grid">
      ${["Builder delivery", "Legal and RERA", "Employment demand", "Infrastructure certainty", "Affordability", "Rental yield", "Exit liquidity"].map((title) =>
        `<article class="score-card"><span>Assessment axis</span><h3>${escapeHtml(title)}</h3><p>Unknown inputs remain unscored rather than receiving assumed values.</p></article>`
      ).join("")}
    </section>
    <section class="panel">
      ${table([
        { label: "Project", render: (row) => entityLink(row, "housingProjects", "name") },
        { label: "Promoter", key: "promoter" },
        { label: "RERA", key: "rera" },
        { label: "Possession", key: "possession" },
        { label: "Stage", render: (row) => stageBadge(row.stage) },
        { label: "Price evidence", key: "priceEvidence" },
        { label: "Coverage", key: "coverage" }
      ], data.housingProjects)}
    </section>
    <section class="panel calculator-panel">
      <p class="eyebrow">Buyer affordability calculator</p>
      <h2>What can the household safely finance?</h2>
      <p class="data-note">Illustrative only. Change every assumption. The model uses household income, essential spending, savings, EMI cap, rate, tenure and down payment; it is not lender approval or financial advice.</p>
      <div class="calculator-grid">
        <label>Monthly gross household income (Rs)<input id="calc-income" type="number" min="0" value="175000"></label>
        <label>Take-home share of gross (%)<input id="calc-takehome" type="number" min="50" max="100" value="85"></label>
        <label>Essential monthly spending (Rs)<input id="calc-spend" type="number" min="0" value="65000"></label>
        <label>Emergency/investment saving (Rs)<input id="calc-save" type="number" min="0" value="25000"></label>
        <label>Maximum EMI share of income (%)<input id="calc-cap" type="number" min="5" max="60" value="30"></label>
        <label>Home-loan interest (%)<input id="calc-rate" type="number" min="1" max="20" step="0.1" value="8.5"></label>
        <label>Loan tenure (years)<input id="calc-years" type="number" min="1" max="30" value="25"></label>
        <label>Down payment (%)<input id="calc-down" type="number" min="5" max="90" value="20"></label>
        <label>Stamp/registration/other upfront (%)<input id="calc-costs" type="number" min="0" max="20" value="8"></label>
      </div>
      <div class="calculator-result" id="calc-result"></div>
    </section>
    <section class="panel">
      <p class="eyebrow">Scenario analysis</p>
      <h2>What must happen by 2030?</h2>
      ${table([
        { label: "Scenario", key: "name" },
        { label: "Conditions", key: "conditions" },
        { label: "Indicative nominal range", key: "range" },
        { label: "Rental implication", key: "yield" }
      ], analysis.scenarios)}
    </section>
    <section class="panel">
      <p class="eyebrow">Principal risks</p>
      <h2>Risks that the headline airport story does not price clearly</h2>
      <ol class="risk-list">${analysis.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("")}</ol>
    </section>`;
  }

  function renderBuilders() {
    const builderData = window.REALTYPROOF_BUILDERS || { builders: [], sources: [] };
    const sourceMap = new Map([
      ...rawData.sources.map((source) => [source.id, source]),
      ...builderData.sources.map((source) => [source.id, source])
    ]);
    const builders = builderData.builders.filter((builder) =>
      builder.markets.includes(activeMarket)
    );
    const actorCases = (builderData.actorCases || []).filter((actorCase) =>
      actorCase.markets.includes(activeMarket)
    );
    return `${hero(
      "Builder profiles",
      "Legal entities, brands, insolvency actors and project roles remain separate. No builder grade is published before delivery, issue and financial evidence reaches the methodology gate.",
      `${activeMarketDefinition.shortLabel} builder intelligence`
    )}
    <section class="stats-grid">
      ${stat("Builder profiles", builders.length, "No inherited brand scores")}
      ${stat("Actor cases", actorCases.length, "Promoters, receivers and resolution actors separated")}
      ${stat("Published ratings", 0, "Coverage gate not yet met")}
      ${stat("Identity rule", "CIN / LLPIN", "Name similarity never merges entities")}
    </section>
    <section class="panel callout">
      <h2>Actor roles are not interchangeable</h2>
      <p>Original promoters, current promoters, resolution applicants, Court Receivers, insolvency professionals, construction agencies and authorities are modeled separately.</p>
    </section>
    <section class="builder-grid">
      ${builders.map((builder) => {
        const sources = builder.sourceIds.map((sourceId) => sourceMap.get(sourceId)).filter(Boolean);
        return `<article class="builder-card">
          <div class="builder-card-heading">
            <h2>${escapeHtml(builder.displayName)}</h2>
            <span class="confidence">${escapeHtml(builder.evidenceConfidence)} evidence</span>
          </div>
          <span class="badge badge-watch">${escapeHtml(builder.publicationStatus.replaceAll("_", " "))}</span>
          <p>${escapeHtml(builder.actorNote)}</p>
          <p><strong>Rating:</strong> Not published</p>
          ${watchButton("builders", builder.builderId)}
          <p class="data-note">Reviewed ${escapeHtml(builder.lastVerified)} · ${sources.map((source) =>
            `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.publisher)} (${source.exactRecord ? "exact record" : "publisher index"})</a>`
          ).join(" · ")}</p>
        </article>`;
      }).join("") || emptyState(`No builder profile is yet attributable to ${activeMarketDefinition.label}.`)}
    </section>
    <section class="panel">
      <p class="eyebrow">Complex actor cases</p>
      <h2>Research queue, not builder profiles</h2>
      ${actorCases.map((actorCase) => {
        const sources = actorCase.sourceIds.map((sourceId) => sourceMap.get(sourceId)).filter(Boolean);
        return `<article class="actor-case">
          <div class="builder-card-heading">
            <h3>${escapeHtml(actorCase.displayName)}</h3>
            <span class="confidence">${escapeHtml(actorCase.evidenceConfidence)} evidence</span>
          </div>
          <ul>${actorCase.actors.map((actor) =>
            `<li><strong>${escapeHtml(actor.name)}</strong> · ${escapeHtml(actor.role.replaceAll("_", " "))}</li>`
          ).join("")}</ul>
          <p><strong>Blocker:</strong> ${escapeHtml(actorCase.blocker)}</p>
          <p class="data-note">Reviewed ${escapeHtml(actorCase.lastVerified)} · ${sources.map((source) =>
            `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.publisher)} (${source.exactRecord ? "exact record" : "portal index"})</a>`
          ).join(" · ")}</p>
        </article>`;
      }).join("")}</section>`;
  }

  function renderCompare() {
      const selected = readWatchlist();
      const builderData = window.REALTYPROOF_BUILDERS || { builders: [] };
      const projects = projectCatalog().filter((project) =>
        selected.projects.includes(project.id)
      );
      const savedProjects = projectCatalog().filter((project) =>
        selected.savedProjects.includes(project.id)
      );
      const builders = builderData.builders.filter((builder) =>
        selected.builders.includes(builder.builderId) && builder.markets.includes(activeMarket)
      );
      return `${hero(
        "Shortlist and compare",
        "Compare only like-with-like evidence. Missing is unavailable, never zero; unequal source scopes are not directly comparable.",
        `${activeMarketDefinition.shortLabel} buyer workspace`
      )}
      <section class="stats-grid">
        ${stat("Projects selected", projects.length, "Maximum four")}
        ${stat("Saved projects", savedProjects.length, "Maximum four · this browser")}
        ${stat("Builders selected", builders.length, "Maximum four")}
        ${stat("Ratings", "NR", "No forced score or ranking")}
      </section>
      <section class="panel">
        <p class="eyebrow">Project comparison</p>
        <h2>Evidence and modelling inputs</h2>
        ${projects.length ? table([
          { label: "Identity", render: (row) => `${escapeHtml(row.projectName)} · ${escapeHtml(row.phase)} · ${escapeHtml(row.reraNumber || "Unavailable")}` },
          { label: "Location", render: (row) => `${escapeHtml(row.location || "Unavailable")} · ${escapeHtml(row.marketLabel)}` },
          { label: "Published price evidence", render: (row) => escapeHtml(row.price || "Unavailable") },
          { label: "Published delivery evidence", render: (row) => escapeHtml(row.delivery || "Unavailable") },
          { label: "Published promoter", render: (row) => escapeHtml(row.legalPromoterLabel || "Unavailable") },
          { label: "Reviewed RERA facts", render: (row) => row.reraFacts.length
            ? `<a class="entity-link" href="${projectUrl(row.id)}#rera-facts">${escapeHtml(row.reraFactSummary)} →</a>`
            : "Unavailable" },
          { label: "Evidence gaps / freshness", render: (row) => `${escapeHtml(row.criticalMissing[0] || "Unavailable")} · verified ${escapeHtml(row.lastVerified || "Unavailable")}` },
          { label: "Comparison basis", render: () => "Not directly comparable" },
          { label: "Calculator handoff", render: (row) => `<a class="entity-link" href="${marketUrl(`${root}/pages/calculator.html?project=${encodeURIComponent(row.id)}`)}">Open with unavailable inputs →</a>` },
          { label: "Map", render: (row) => `<a class="entity-link" href="${projectMapUrl(row)}">Open map context →</a>` },
          { label: "Action", render: (row) => `<button type="button" class="watch-toggle" data-compare-project="${escapeHtml(row.id)}" aria-pressed="true">Remove</button>` }
        ], projects) : `${emptyState("Select up to four projects from the Projects index to compare them here.")}
          <p><a class="button-link" href="${marketUrl(`${root}/pages/projects.html`)}">Browse projects to compare</a></p>`}
        <p class="data-note">Unavailable is not zero. Published price may be marketing or asking-price evidence, not all-in cost or a registered deed; declared delivery is not proof of completion, OC/CC or occupancy; promoter labels do not establish group/SPV strength. Returns require explicit user inputs until critical project evidence is published.</p>
      </section>
      <section class="panel">
        <p class="eyebrow">Saved projects</p>
        <h2>Local browser shortlist</h2>
        ${savedProjects.length ? `<div class="project-grid compact-project-grid">${savedProjects.map(projectCard).join("")}</div>` : emptyState("Save projects from a proof page or project card. Nothing leaves this browser.")}
      </section>
      <section class="panel">
        <p class="eyebrow">Builder comparison</p>
        <h2>Profiles remain unrated until evidence coverage is sufficient</h2>
        ${builders.length ? table([
          { label: "Builder", key: "displayName" },
          { label: "Profile state", key: "publicationStatus" },
          { label: "Evidence", key: "evidenceConfidence" },
          { label: "Current limitation", key: "actorNote" },
          { label: "Action", render: (row) => watchButton("builders", row.builderId, "Compare") }
        ], builders) : emptyState("Add builders from the Builder Profiles page.")}
      </section>
      <section class="panel callout">
        <h2>Evidence alerts are the next backend milestone</h2>
        <p>The local shortlist is ready. QPR, OC/CC, court, issue, price and evidence-change notifications require authenticated persistence and scheduled source monitoring.</p>
      </section>`;
  }

  function renderWorkforce() {
    if (!["gbn", "yeida"].includes(activeMarket)) {
      return marketUnavailable("Workforce and affordability analysis");
    }
    const analysis = data.workforceAnalysis;
    const parity = data.housingParity;
    return `${hero(
      "Who can afford what this corridor is building?",
      "Job creation is separated into white-, grey- and blue-collar income bands, then translated into rent and ownership capacity.",
      "Workforce, spending and household budgets"
    )}
    <section class="panel housing-verdict">
      <p class="eyebrow">Demand shape</p>
      <h2>${escapeHtml(analysis.headline)}</h2>
      <p>${escapeHtml(analysis.conclusion)}</p>
      <p class="data-note"><strong>Statutory floor:</strong> ${escapeHtml(analysis.statutoryFloor)}</p>
      <p class="data-note"><strong>Evidence limit:</strong> ${escapeHtml(analysis.evidenceLimit)}</p>
    </section>
    <section class="panel parity-callout">
      <p class="eyebrow">Housing demand vs supply</p>
      <h2>${escapeHtml(parity.headline)}</h2>
      <div class="stats-grid compact-stats">
        ${stat("Identified apartments", parity.supplySummary.apartments.toLocaleString("en-IN"), "Sector 22D RERA universe")}
        ${stat("2028-31 apartments", parity.supplySummary.futureApartments2028to2031.toLocaleString("en-IN"), "RERA date cohort, not delivery evidence")}
        ${stat("Base 22D demand", parity.demandScenarios[1].sector22dDemand.toLocaleString("en-IN"), "Modelled workforce-linked units")}
        ${stat("Premium base ratio", "9.3-10.5x", "Gross stock / modelled base incremental demand")}
      </div>
      <p><a class="entity-link" href="${marketUrl(`${root}/pages/housing-parity.html`)}">Open the full RERA, FAR and segment-parity model →</a></p>
    </section>
    <section class="panel">
      <p class="eyebrow">Gross monthly salary evidence</p>
      ${table([
        { label: "Employment category", key: "category" },
        { label: "Entry / shop floor", key: "entry" },
        { label: "Mid-level", key: "mid" },
        { label: "Senior / specialist", key: "senior" },
        { label: "Observation date", key: "evidenceDate" },
        { label: "Confidence", key: "confidence" }
      ], analysis.salaryBands)}
    </section>
    <section class="panel">
      <p class="eyebrow">Ownership capacity</p>
      <h2>Prudent gross household income required</h2>
      ${table([
        { label: "Home price", key: "home" },
        { label: "Loan", key: "loan" },
        { label: "EMI", key: "emi" },
        { label: "Upfront cash", key: "upfront" },
        { label: "30% EMI cap", key: "prudentGross" },
        { label: "35% stretch", key: "stretchGross" }
      ], analysis.affordability)}
      <p class="data-note">Base: 8.5% loan, 25 years, LTV 90% up to Rs 30L, 80% from Rs 30L to Rs 75L and 75% above Rs 75L; upfront cash is down payment plus 8% transaction charges. No existing EMI. Under-construction GST is excluded.</p>
    </section>
    <section class="panel">
      <p class="eyebrow">Rental demand</p>
      ${table([
        { label: "Household", key: "profile" },
        { label: "Combined gross", key: "gross" },
        { label: "Prudent rent", key: "rent" },
        { label: "Likely product", key: "housing" }
      ], analysis.rentProfiles)}
    </section>
    <section class="two-column">
      <article class="panel">
        <p class="eyebrow">Model assumptions</p>
        <div class="detail-grid">${Object.entries(analysis.assumptions).map(([key, value]) =>
          `<div class="detail-field"><span>${escapeHtml(key.replaceAll(/([A-Z])/g, " $1"))}</span><div>${escapeHtml(value)}</div></div>`
        ).join("")}</div>
      </article>
      <article class="panel callout">
        <p class="eyebrow">Local-spend capture</p>
        <h2>Jobs only become housing demand when workers live locally.</h2>
        <p>Resident households support groceries, schools, healthcare and services. Long-distance commuters mainly support transport and daytime food expenditure.</p>
      </article>
    </section>`;
  }

  function renderHousingParity() {
    if (!["gbn", "yeida"].includes(activeMarket)) {
      return marketUnavailable("Housing demand-supply parity");
    }
    const parity = data.housingParity;
    const cohortRows = Object.entries(parity.demandAssumptions.cohorts).map(([cohort, values]) => ({
      cohort,
      shared: `${Math.round(values.sharedShare * 100)}%`,
      occupants: values.occupantsPerSharedUnit,
      workers: values.workersPerIndependentHousehold,
      allocation: `<Rs60L ${Math.round(values.ticketAllocation.sub60 * 100)}%; Rs60-90L ${Math.round(values.ticketAllocation.from60to90 * 100)}%; Rs90L-1.5Cr ${Math.round(values.ticketAllocation.from90to150 * 100)}%; >Rs1.5Cr ${Math.round(values.ticketAllocation.above150 * 100)}%`
    }));
    const captureRows = Object.entries(parity.demandAssumptions.sectorCapture).map(([scenario, values]) => ({
      scenario,
      shared: `${Math.round(values.shared * 100)}%`,
      sub60: `${Math.round(values.sub60 * 100)}%`,
      from60to90: `${Math.round(values.from60to90 * 100)}%`,
      from90to150: `${Math.round(values.from90to150 * 100)}%`,
      above150: `${Math.round(values.above150 * 100)}%`
    }));
    const ownerAssumptionRows = Object.entries(parity.demandAssumptions.ownerPartner).map(([scenario, values]) => ({
      scenario,
      principals: values.principalsPer100PayrollJobs,
      localResidence: `${Math.round(values.localResidenceRate * 100)}%`,
      capture: `${Math.round(values.sector22dCaptureRate * 100)}%`,
      allocation: `<Rs60L ${Math.round(values.ticketAllocation.sub60 * 100)}%; Rs60-90L ${Math.round(values.ticketAllocation.from60to90 * 100)}%; Rs90L-1.5Cr ${Math.round(values.ticketAllocation.from90to150 * 100)}%; >Rs1.5Cr ${Math.round(values.ticketAllocation.above150 * 100)}%`
    }));
    return `${hero(
      "Housing demand versus supply",
      "RERA-identified stock, YEIDA FAR capacity and workforce-linked household demand compared by RERA completion-date cohort and ticket segment.",
      "Sector 22D and immediate Jewar corridor"
    )}
    <section class="panel housing-verdict">
      <p class="eyebrow">Parity conclusion</p>
      <h2>${escapeHtml(parity.headline)}</h2>
      <p class="data-note">As of ${escapeHtml(parity.asOf)} · RERA snapshot ${escapeHtml(parity.reraSnapshot)} · Confidence: ${escapeHtml(parity.confidence)}</p>
    </section>
    <section class="stats-grid">
      ${stat("Apartments", parity.supplySummary.apartments.toLocaleString("en-IN"), "Known-count floor; four registrations unquantified")}
      ${stat("Plotted units", parity.supplySummary.plots.toLocaleString("en-IN"), "Economically different supply")}
      ${stat("Future apartments", parity.supplySummary.futureApartments2028to2031.toLocaleString("en-IN"), "Known-count floor for RERA dates 2028-31")}
      ${stat("Bedroom-room range", `${parity.supplySummary.bedroomRoomsMin.toLocaleString("en-IN")}-${parity.supplySummary.bedroomRoomsMax.toLocaleString("en-IN")}`, "Across 4,063 flats with a usable BHK range")}
      ${stat("Base owner demand", parity.ownerPartnerDemand[1].sector22dOwnerHouseholds.toLocaleString("en-IN"), "MSME/business principals added separately")}
      ${stat("Occupied households", "Unavailable", "Requires utility/occupancy records")}
    </section>
    <section class="panel">
      <p class="eyebrow">RERA supply register</p>
      <h2>Known Sector 22D residential supply</h2>
      ${table([
        { label: "Project", key: "name" },
        { label: "RERA", key: "rera" },
        { label: "Promoter", key: "promoter" },
        { label: "Product", key: "product" },
        { label: "Model count", render: (row) => row.units == null ? "<span class=\"unknown\">Not verified</span>" : `${Number(row.units).toLocaleString("en-IN")} ${escapeHtml(row.unitLabel)}` },
        { label: "Completion", key: "completion" },
        { label: "Portal status", key: "status" },
        { label: "Evidence", key: "evidence" }
      ], parity.supplyProjects)}
      <p class="data-note">Completion dates do not prove completion, OC, possession or habitation. Sold/unsold, OC/CC-covered and occupied units remain unavailable.</p>
    </section>
    <section class="panel">
      <p class="eyebrow">Room and unit supply density</p>
      <h2>Bedrooms and flats per acre</h2>
      ${table([
        { label: "Project", key: "project" },
        { label: "Product", key: "product" },
        { label: "Land acres", render: (row) => Number(row.landAreaAcres).toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
        { label: "Units", render: (row) => Number(row.units).toLocaleString("en-IN") },
        { label: "Units/acre", render: (row) => Number(row.unitsPerAcre).toLocaleString("en-IN", { maximumFractionDigits: 1 }) },
        { label: "Bedroom rooms", render: (row) => row.bedroomRoomsMin == null ? "<span class=\"unknown\">Mix unavailable</span>" : `${Number(row.bedroomRoomsMin).toLocaleString("en-IN")}-${Number(row.bedroomRoomsMax).toLocaleString("en-IN")}` },
        { label: "Bedroom rooms/acre", render: (row) => row.roomsPerAcreMin == null ? "<span class=\"unknown\">Not modelled</span>" : `${Number(row.roomsPerAcreMin).toLocaleString("en-IN", { maximumFractionDigits: 1 })}-${Number(row.roomsPerAcreMax).toLocaleString("en-IN", { maximumFractionDigits: 1 })}` },
        { label: "Room basis", key: "bedroomBasis" },
        { label: "Confidence", key: "confidence" }
      ], parity.densitySupply)}
      <p class="data-note">${escapeHtml(parity.densityBasis)}</p>
    </section>
    <section class="panel">
      <p class="eyebrow">UP-RERA to YEIDA GIS crosswalk</p>
      <h2>Project registrations mapped to authority parcels</h2>
      <div class="callout">
        <h3>RERA number alone is not a safe key</h3>
        ${table([
          { label: "Visible RERA number", key: "reraNumber" },
          { label: "Conflicting visible records", key: "visibleRecords" },
          { label: "Safe handling", key: "handling" }
        ], parity.reraIdentifierWarnings)}
      </div>
      ${table([
        { label: "Project", key: "projectName" },
        { label: "RERA", key: "reraNumber" },
        { label: "Promoter legal entity", render: (row) => row.promoterLegalEntity
          ? escapeHtml(row.promoterLegalEntity)
          : `${escapeHtml(row.promoterRegistryLabel)} <span class="unknown">legal suffix unresolved</span>` },
        { label: "Sector", key: "sector" },
        { label: "RERA parcel", key: "reraParcelIdentifier" },
        { label: "YEIDA GIS parcel", render: (row) => `${escapeHtml(row.gisPlotIdentifier)} · OID ${escapeHtml(row.gisObjectId)}` },
        { label: "Match", render: (row) => `${escapeHtml(row.matchMethod.replaceAll("_", " "))} · ${escapeHtml(row.matchScope.replaceAll("-", " "))}` },
        { label: "Confidence", key: "confidence" },
        { label: "Boundary caveat", key: "ambiguity" }
      ], data.reraYeidaPlotMappings)}
      <p class="data-note">Authority self-promoted schemes are excluded from this private/promoter crosswalk. RERA number alone is not used as a database key because the current registry exposes duplicate visible numbers. Exact/normalized identifier links are strongest; parent-parcel and spatial links do not establish the internal project boundary.</p>
      <p><a class="button-link" href="${root}/pages/map.html?market=yeida&authority=yeida&category=rera-project-parcels">Open the clickable RERA parcel layer</a></p>
    </section>
    <section class="panel">
      <p class="eyebrow">YEIDA FAR and capacity</p>
      <h2>Operative controls, not marketing FAR</h2>
      ${table([
        { label: "Use", key: "use" },
        { label: "FAR", key: "far" },
        { label: "Ground coverage", key: "coverage" },
        { label: "Density", key: "density" },
        { label: "Height", key: "height" },
        { label: "Evidence", key: "evidence" }
      ], parity.farRules)}
      <p class="data-note">Group-housing FAR is 3.0 in the cited regulations. Purchasable FAR is discretionary and cannot exceed the applicable maximum; the 0.40 charge factor is not 40% extra FAR.</p>
    </section>
    <section class="panel">
      <p class="eyebrow">Known 2028-31 parcels</p>
      <h2>Theoretical dwelling capacity at FAR 3.0</h2>
      ${table([
        { label: "Project", key: "project" },
        { label: "Plot sqm", render: (row) => Number(row.plotSqm).toLocaleString("en-IN") },
        { label: "FAR BUA sqm", render: (row) => Number(row.farBuaSqm).toLocaleString("en-IN") },
        { label: "Premium @180sqm", render: (row) => Number(row.premium180).toLocaleString("en-IN") },
        { label: "Mid @130sqm", render: (row) => Number(row.mid130).toLocaleString("en-IN") },
        { label: "Compact @90sqm", render: (row) => Number(row.compact90).toLocaleString("en-IN") }
      ], parity.capacity2028to2031)}
      <p class="data-note">${escapeHtml(parity.capacityAreaBasis)} Actual capacity also depends on scheme density, common areas, sanctions and AAI/fire/environment approvals.</p>
    </section>
    <section class="panel">
      <p class="eyebrow">Demand-model assumptions</p>
      <h2>Household formation and ticket allocation</h2>
      ${table([
        { label: "Cohort", key: "cohort" },
        { label: "Shared accommodation", key: "shared" },
        { label: "Occupants/shared unit", key: "occupants" },
        { label: "Workers/independent HH", key: "workers" },
        { label: "Ticket allocation", key: "allocation" }
      ], cohortRows)}
      <h3>Sector 22D capture of corridor demand</h3>
      ${table([
        { label: "Scenario", key: "scenario" },
        { label: "Shared", key: "shared" },
        { label: "<Rs60L", key: "sub60" },
        { label: "Rs60-90L", key: "from60to90" },
        { label: "Rs90L-1.5Cr", key: "from90to150" },
        { label: ">Rs1.5Cr", key: "above150" }
      ], captureRows)}
      <h3>MSME, business-owner and active-partner assumptions</h3>
      ${table([
        { label: "Scenario", key: "scenario" },
        { label: "Principal HH / 100 payroll jobs", key: "principals" },
        { label: "Local residence", key: "localResidence" },
        { label: "Sector 22D capture", key: "capture" },
        { label: "Ticket allocation", key: "allocation" }
      ], ownerAssumptionRows)}
      <p class="data-note">These are explicit scenario assumptions, not an observed census. They represent proprietor/partner/director households outside payroll-job counts.</p>
    </section>
    <section class="panel">
      <p class="eyebrow">Owner and partner demand</p>
      <h2>Non-payroll principals added to residential demand</h2>
      ${table([
        { label: "Scenario", key: "scenario" },
        { label: "Payroll jobs", render: (row) => Number(row.payrollJobs).toLocaleString("en-IN") },
        { label: "Principal households", render: (row) => Number(row.principalHouseholds).toLocaleString("en-IN") },
        { label: "Corridor owner HH", render: (row) => Number(row.corridorOwnerHouseholds).toLocaleString("en-IN") },
        { label: "Sector 22D owner HH", render: (row) => Number(row.sector22dOwnerHouseholds).toLocaleString("en-IN") },
        { label: "<Rs60L", render: (row) => Number(row.segments.sub60).toLocaleString("en-IN") },
        { label: "Rs60-90L", render: (row) => Number(row.segments.from60to90).toLocaleString("en-IN") },
        { label: "Rs90L-1.5Cr", render: (row) => Number(row.segments.from90to150).toLocaleString("en-IN") },
        { label: ">Rs1.5Cr", render: (row) => Number(row.segments.above150).toLocaleString("en-IN") },
        { label: "Confidence", key: "confidence" }
      ], parity.ownerPartnerDemand)}
    </section>
    <section class="panel">
      <p class="eyebrow">Demand scenarios to 2031</p>
      <h2>Jobs converted to resident households—not headline homes</h2>
      ${table([
        { label: "Scenario", key: "scenario" },
        { label: "Realised jobs", render: (row) => Number(row.realisedJobs).toLocaleString("en-IN") },
        { label: "Local residence", key: "localResidence" },
        { label: "Blue/Grey/White", render: (row) => `${Math.round(row.cohortShares.blue * 100)}/${Math.round(row.cohortShares.grey * 100)}/${Math.round(row.cohortShares.white * 100)}%` },
        { label: "Payroll 22D demand", render: (row) => Number(row.sector22dPayrollDemand).toLocaleString("en-IN") },
        { label: "Owner/partner demand", render: (row) => Number(row.ownerPartnerDemand).toLocaleString("en-IN") },
        { label: "Combined 22D demand", render: (row) => Number(row.sector22dDemand).toLocaleString("en-IN") },
        { label: "Shared rental", render: (row) => Number(row.combinedSegments.shared).toLocaleString("en-IN") },
        { label: "<Rs60L", render: (row) => Number(row.combinedSegments.sub60).toLocaleString("en-IN") },
        { label: "Rs60-90L", render: (row) => Number(row.combinedSegments.from60to90).toLocaleString("en-IN") },
        { label: "Rs90L-1.5Cr", render: (row) => Number(row.combinedSegments.from90to150).toLocaleString("en-IN") },
        { label: ">Rs1.5Cr", render: (row) => Number(row.combinedSegments.above150).toLocaleString("en-IN") }
      ], parity.demandScenarios)}
      <p class="data-note">${escapeHtml(parity.demandFormula)}</p>
    </section>
    <section class="panel">
      <p class="eyebrow">Ticket-segment parity</p>
      <h2>Where supply and demand do not match</h2>
      ${table([
        { label: "Segment", key: "segment" },
        { label: "Gross supply", key: "supply" },
        { label: "Base requirement", key: "baseNeed" },
        { label: "Base cover", key: "baseCover" },
        { label: "Bull requirement", key: "bullNeed" },
        { label: "Interpretation", key: "interpretation" }
      ], parity.ticketParity)}
    </section>
    <section class="panel">
      <p class="eyebrow">Wider corridor</p>
      ${table([
        { label: "Scenario", key: "scenario" },
        { label: "Incremental demand", render: (row) => Number(row.demand).toLocaleString("en-IN") },
        { label: "Known apartment floor", key: "knownApartmentFloor" },
        { label: "Gross stock/demand", key: "ratio" },
        { label: "Interpretation", key: "interpretation" }
      ], parity.corridorParity)}
    </section>
    <section class="panel">
      <p class="eyebrow">Primary-data gaps</p>
      <h2>What would turn this model into measurement</h2>
      <ol class="risk-list">${parity.criticalGaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ol>
    </section>`;
  }

  function renderInfrastructure() {
    const operating = data.infrastructure.filter((item) => item.stage === "operational").length;
    const building = data.infrastructure.filter((item) => item.stage === "construction").length;
    const preConstruction = data.infrastructure.filter((item) =>
      ["idea", "planning", "feasibility", "dpr", "approval", "funding", "tender", "land_acquired"].includes(item.stage)
    ).length;
    return `${hero(
      "Infrastructure: ground reality versus priced-in dreams",
      "Every road, rail, metro, RRTS, freight, airport and utility claim is located on an execution ladder.",
      "Maturity, dependencies and timing"
    )}
    <section class="stats-grid">
      ${stat("Operational", operating, "Usable today")}
      ${stat("Under construction", building, "Physical execution")}
      ${stat("Pre-construction", preConstruction, "DPR, approval, funding or tender")}
      ${stat("Tracked assets", data.infrastructure.length, "Each with an evidence date")}
    </section>
    <section class="two-column">
      <article class="panel">
        <p class="eyebrow">Value that exists now</p>
        <h2>Airport, expressways, DFC and Aqua Line</h2>
        <p>These are operating assets. Sector 22D still requires society-level evidence for permanent power, water pressure, sewer outfall and all-weather access.</p>
      </article>
      <article class="panel callout">
        <p class="eyebrow">Do not price as completed</p>
        <h2>RRTS, bullet train and airport metro</h2>
        <p>DPR or review status deserves little present valuation premium until sanction, funding, tenders and physical construction follow.</p>
      </article>
    </section>
    <section class="panel">
      ${table([
        { label: "Project", render: (row) => entityLink(row, "infrastructure", "name") },
        { label: "Mode", key: "mode" },
        { label: "Current milestone", key: "milestone" },
        { label: "Stage", render: (row) => stageBadge(row.stage) },
        { label: "Housing relevance now", key: "housingRelevance" },
        { label: "Evidence date", key: "evidenceDate" }
      ], data.infrastructure)}
    </section>`;
  }

  function timelineCards(rows) {
    const sourceMap = new Map(data.sources.map((source) => [source.id, source]));
    if (!rows.length) return emptyState("No timeline milestone matches the active filters.");
    return rows.map((event) => {
      const sources = (event.sourceIds || []).map((id) => sourceMap.get(id)).filter(Boolean);
      const recent = String(event.date) >= "2025";
      return `<article class="timeline-card ${recent ? "recent" : ""}">
        <div class="timeline-date"><strong>${escapeHtml(event.date)}</strong><span>${escapeHtml(event.category)}</span></div>
        <div class="timeline-body">
          <div class="timeline-title"><h3>${escapeHtml(event.title)}</h3>${stageBadge(event.stage)}</div>
          <p>${escapeHtml(event.summary)}</p>
          <p class="timeline-impact"><strong>Why it matters:</strong> ${escapeHtml(event.impact)}</p>
          <div class="timeline-sources">${sources.map((source) =>
            `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.publisher)}</a>`
          ).join("")}</div>
          <small>Confidence: ${escapeHtml(event.confidence)} · verified ${escapeHtml(event.lastVerified)}</small>
        </div>
      </article>`;
    }).join("");
  }

  function renderTimeline() {
    const events = [...data.timelineEvents].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const categories = [...new Set(events.map((event) => event.category))].sort();
    return `${hero(
      "From promise to operation",
      "A dated record of openings, approvals, allotments, construction, missed deadlines, cancellations and failures.",
      "Project and investment milestone timeline"
    )}
    <section class="stats-grid">
      ${stat("Dated milestones", events.length, "Every card cites evidence")}
      ${stat("2025-2026 changes", events.filter((event) => String(event.date) >= "2025").length, "Highlighted in the timeline")}
      ${stat("Operational milestones", events.filter((event) => event.stage === "operational").length, "Reached actual use")}
      ${stat("Failed/reset milestones", events.filter((event) => event.stage === "failed").length, "Execution history retained")}
    </section>
    <section class="panel timeline-controls">
      <label>Search<input id="timeline-search" type="search" placeholder="Airport, Film City, metro, company..."></label>
      <label>Category<select id="timeline-category"><option value="">All categories</option>${categories.map((value) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      ).join("")}</select></label>
      <label>Stage<select id="timeline-stage"><option value="">All stages</option>${[...data.stages, ...data.infraStages].filter((item, index, all) =>
        all.findIndex((other) => other.key === item.key) === index
      ).map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}</select></label>
    </section>
    <section id="timeline-list" class="timeline">${timelineCards(events)}</section>`;
  }

  function renderClusters() {
    return `${hero(
      "Film City and international cluster claims",
      "Failed tenders, reserved sectors and marketing labels are not treated as operating economic clusters.",
      "Intent, anchors and execution"
    )}
    <section class="panel housing-verdict">
      <p class="eyebrow">Reality hierarchy</p>
      <h2>Film City has a concession and land; Japanese/Korean cities have planning; American City remains an idea.</h2>
      <p>None is treated as an operating employment centre. Medical Device, Toy and Apparel parks receive more weight only where leases, possession or physical construction are evidenced.</p>
    </section>
    <section class="panel">
      ${table([
        { label: "Cluster", render: (row) => entityLink(row, "clusters", "name") },
        { label: "Official purpose", key: "purpose" },
        { label: "Counterparty / anchors", key: "anchors" },
        { label: "Stage", render: (row) => stageBadge(row.stage) },
        { label: "Failed attempts", key: "failedAttempts" },
        { label: "Practical assessment", key: "assessment" }
      ], data.clusters)}
    </section>`;
  }

  function renderMethodology() {
    return `${hero(
      "Methodology and evidence contract",
      "The report preserves uncertainty, dates every claim and prevents soft announcements from entering the job-demand model.",
      "Reproducible anti-hype analysis"
    )}
    <section class="two-column">
      <article class="panel">
        <p class="eyebrow">Source hierarchy</p>
        <h2>Primary evidence first</h2>
        <ol>
          <li>Authority, RERA, tender, concession and regulatory documents</li>
          <li>Company filings and official releases</li>
          <li>Established media and institutional research</li>
          <li>Property portals for asking-price signals</li>
          <li>Broker or marketing material, always marked low-strength</li>
        </ol>
      </article>
      <article class="panel">
        <p class="eyebrow">Confidence</p>
        <h2>No invented precision</h2>
        <ul>
          <li><strong>VERIFIED:</strong> two or more reliable sources</li>
          <li><strong>UNVERIFIED:</strong> a single or weak source</li>
          <li><strong>UNABLE TO VERIFY:</strong> no dependable public evidence</li>
          <li><strong>CONFLICTING:</strong> material sources disagree</li>
        </ul>
      </article>
    </section>
    <section class="panel">
      <p class="eyebrow">Infrastructure maturity ladder</p>
      <div class="stage-flow">${data.infraStages.map((item) => stageBadge(item.key)).join("")}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">Source ledger</p>
      ${table([
        { label: "Source", key: "title" },
        { label: "Publisher", key: "publisher" },
        { label: "Date", key: "date" },
        { label: "Strength", key: "strength" },
        { label: "Used for", key: "usedFor" }
      ], data.sources)}
    </section>
    <section class="panel">
      <p class="eyebrow">Downloads</p>
      <h2>Machine-readable evidence</h2>
      <div class="download-grid">
        ${["plots", "medical-device-park-allottees", "companies", "interest-events", "housing-projects", "rera-yeida-plot-mapping", "housing-supply", "housing-density", "housing-owner-demand", "housing-far", "housing-demand", "housing-ticket-parity", "housing-corridor-parity", "infrastructure", "clusters", "timeline", "sources"].map((name) =>
          `<a href="${root}/downloads/${name}.csv" download>${escapeHtml(name.replaceAll("-", " "))}.csv</a>`
        ).join("")}
        <a href="${root}/downloads/all-data.json" download>all-data.json</a>
      </div>
    </section>`;
  }

  function renderRoadmap() {
    const groups = ["P0", "P1", "P2"];
    const descriptions = {
      P0: "Data foundations required for trustworthy buyer decisions",
      P1: "Depth, performance and decision-workflow improvements",
      P2: "Distribution, accessibility and community-evidence features"
    };
    return `${hero(
      "Enhancement scope",
      "A prioritized roadmap derived from the report's explicit evidence gaps, map limitations and buyer-decision needs.",
      "What should be built next?"
    )}
    <section class="stats-grid">
      ${stat("P0 foundations", data.enhancementRoadmap.filter((item) => item.priority === "P0").length, "Highest evidence value")}
      ${stat("P1 enhancements", data.enhancementRoadmap.filter((item) => item.priority === "P1").length, "Depth and usability")}
      ${stat("P2 extensions", data.enhancementRoadmap.filter((item) => item.priority === "P2").length, "Scale and distribution")}
      ${stat("Total scoped", data.enhancementRoadmap.length, "Each has a verification gate")}
    </section>
    ${groups.map((priority) => `
      <section class="panel">
        <p class="eyebrow">${priority}</p>
        <h2>${escapeHtml(descriptions[priority])}</h2>
        <div class="roadmap-grid">${data.enhancementRoadmap.filter((item) => item.priority === priority).map((item) => `
          <article class="roadmap-card">
            <div class="roadmap-title"><span>${escapeHtml(item.priority)}</span><h3>${escapeHtml(item.title)}</h3></div>
            <p><strong>Current gap:</strong> ${escapeHtml(item.gap)}</p>
            <p><strong>Approach:</strong> ${escapeHtml(item.approach)}</p>
            <p><strong>Outcome:</strong> ${escapeHtml(item.outcome)}</p>
            <div class="roadmap-meta"><span>Effort: ${escapeHtml(item.effort)}</span><span>Gate: ${escapeHtml(item.verification)}</span></div>
          </article>`).join("")}</div>
      </section>`).join("")}`;
  }

  function renderAudit() {
    const analytics = window.YEIDA_ANALYTICS_V2;
    const items = [
      ["Plan and discuss scope before implementation", "COVERED", "The work began with an evidence hierarchy, stage ladder, research streams, exclusions and success criteria before collection/implementation.", "Later findings expanded the plan; the original plan is preserved in session history rather than as a standalone report page."],
      ["Every non-individual YEIDA plot and current owner", "PARTIAL", "Named public allotments, live privacy-safe GIS and cancellations are retained.", "YEIDA publishes no reconciled plot-to-legal-entity transaction ledger; certified authority export/RTI remains required."],
      ["Why companies, workers and buyers may choose YEIDA", "COVERED", "The executive overview links operating/committed employers, airport/logistics access, infrastructure maturity, housing affordability and execution risk.", "Motivation remains cohort-specific; it is not evidence that every worker or buyer will relocate."],
      ["Actually established companies and facilities", "COVERED", "Operating, construction, possessed, allotted and soft-interest stages are separate.", "Facility payroll and utilisation are not uniformly public."],
      ["One legal entity per company/allotment row", "COVERED", "May 2026, Medical Device Park, hotels, universities and township cancellations are split.", "Explicit unresolved scheme remainders remain aggregates only when names are unavailable."],
      ["LoIs, MoUs, interest and current conversion state", "COVERED", "Named interest events include instrument, date, capex/jobs claim, conditions and latest state.", "Future lease/possession/construction changes need periodic refresh."],
      ["What companies do, their scale and corridor intent", "COVERED", "Legal entity, business activity, reproducible scale evidence and YEIDA intent are separate fields.", "Private-company revenue/headcount stays unavailable where no reliable source exists."],
      ["White-, grey- and blue-collar jobs, spending and home budgets", "COVERED", "Salary evidence, rental bands, prudent EMI capacity and job-mix cautions are modelled.", "No corridor-wide observed workforce-share or household-spend survey exists."],
      ["Sector 22D price justification versus hype", "COVERED", "Ready benchmark, launch band, yield, affordability, legal risk and scenario valuation are separated.", "Advertised prices are not a deed-level transaction index."],
      ["2029-2031 housing delivery concentration", "COVERED", "RERA completion dates are treated as a date cohort, never as delivery proof.", "Actual construction progress, OC, handover and occupancy require future project-by-project updates."],
      ["Housing demand, supply, FAR and segment parity", "COVERED", "RERA apartments/plots, bedrooms and units per acre, FAR capacity, payroll households and MSME/business-owner/partner demand are reproducible.", "Gross stock cannot prove vacancy, absorption, shortage or surplus; owner/partner rates remain scenario assumptions."],
      ["Film City and Japanese/Korean/American City practicality", "COVERED", "Purpose, named anchors, failed rounds, current stage and execution risks are distinguished.", "Country-city concepts still lack binding anchor allottee lists."],
      ["Reserved land without buyer or intent", "COVERED", "Authority-only plans are excluded from committed job and housing-demand totals.", "Planning designations remain map context only."],
      ["Airport, cargo, roads, metro, RRTS, high-speed rail and freight corridor", "COVERED", "Each project has a stage, dated milestone, dependency and ground-reality interpretation.", "Several rail proposals remain DPR/approval-stage and should not be priced as operating access."],
      ["Noida, GNIDA and YEIDA OneMap integration", "COVERED", "Live official GIS layers include all 30,759 YEIDA residential parcel geometries plus a privacy-safe UP-RERA project crosswalk.", "Natural-person owner/contact/address fields remain excluded; GIS status is not legal title."],
      ["UP-RERA project to YEIDA plot mapping", "COVERED", "Private/promoter registrations are crosswalked to official GIS object IDs with exact, normalized, parent-parcel, spatial and unresolved confidence classes.", "Internal phase footprints remain unresolved where OneMap exposes only a parent township/group-housing parcel."],
      ["Plots behave as interactive buttons with colour coding", "COVERED", "SVG polygons support hover, click, popup, detail panel, search, status outlines and authority-style land-use fills.", "Legal title still requires source documents beyond GIS status."],
      ["Broader news horizon and dated timeline", "COVERED", "Investment, infrastructure, legal reset, opening and failure milestones are dated and sourced.", "News claims remain confidence-graded and need refresh."],
      ["YEIDA map visibility POC with UI tooling", "COVERED", "Official/report before-and-after screenshots and real Chrome/CDP pointer tests prove visible YEIDA polygons and the Sector 22D workflow.", "The full browser suite has an intermittent first-pointer hit-test flake; data, geometry and privacy contracts remain deterministic."],
      ["Full multi-page nested HTML report and downloads", "COVERED", "Thirteen linked report pages, entity detail views, seventeen CSV datasets, canonical link and analytics JSON, and the full evidence bundle are present.", "The build is a local static site; public versioned deployment remains a roadmap item."],
      ["Enhancement scope after the research", "COVERED", "Contract v2, lifecycle correction, canonical joins, acquisition contracts, snapshot diffs, analytics v2 and release gates are implemented.", "Unavailable primary records remain explicit acquisition blockers rather than synthetic data."],
      ["Final full-conversation gap check", "COVERED", "This 22-row matrix now includes the planning, motivation, UI-POC, multi-page and final-audit requests that the earlier compressed matrix omitted.", "Future requests and refreshed evidence require a new dated audit."],
    ];
    const covered = items.filter((item) => item[1] === "COVERED").length;
    const partial = items.filter((item) => item[1] === "PARTIAL").length;
    const quality = analytics ? `
    <section class="stats-grid">
      ${stat("Evidence records", analytics.inventory.evidenceRecords, "Contract-v2 records")}
      ${stat("Official polygons", analytics.inventory.polygons.toLocaleString("en-IN"), `${analytics.inventory.layers} layers`)}
      ${stat("Published joins", analytics.inventory.entityPlotLinks, `${analytics.inventory.unresolvedLinkCandidates} unresolved candidates`)}
      ${stat("Verified deeds", analytics.transactions.transactions, analytics.transactions.available ? "Metrics available" : "No transaction metrics inferred")}
    </section>
    <section class="panel">
      <p class="eyebrow">Data-quality dashboard</p>
      <h2>Unknowns are explicit, not converted to zero</h2>
      ${table([
        { label: "Collection", key: "collection" },
        { label: "Records", key: "records" },
        { label: "Contract fields", key: "contractFields" },
        { label: "Missing / null facts", key: "missingOrNullFacts" },
        { label: "Low confidence", key: "lowConfidence" },
        { label: "Single source", key: "singleSource" }
      ], analytics.quality.collectionQuality)}
    </section>
    <section class="panel">
      <p class="eyebrow">Market coverage</p>
      <h2>City filters expose different evidence depth</h2>
      ${table([
        { label: "Market", key: "label" },
        { label: "Evidence records", key: "evidenceRecords" },
        { label: "Sources", key: "sources" },
        { label: "GIS polygons", render: (row) => Number(row.polygons).toLocaleString("en-IN") },
        { label: "GIS layers", key: "layers" },
        { label: "Housing analytics", render: (row) => row.housingAnalyticsAvailable ? "Available" : "Not yet published" }
      ], Object.values(analytics.markets))}
    </section>
    <section class="panel">
      <p class="eyebrow">Primary-data acquisition</p>
      <h2>Current blockers</h2>
      ${table([
        { label: "Dataset", key: "id" },
        { label: "Status", key: "status" },
        { label: "Blocker", key: "blocker" }
      ], analytics.acquisition)}
    </section>` : "";
    return `${hero(
      "Conversation coverage audit",
      "Every request and correction is checked against a persistent report surface; unresolved evidence is not relabelled as complete.",
      "What was delivered and what remains unknowable"
    )}
    ${quality}
    <section class="stats-grid">
      ${stat("Requirements checked", items.length, "Across the full conversation")}
      ${stat("Covered", covered, "Implemented report surfaces")}
      ${stat("Partial", partial, "Evidence-limited, not forgotten")}
      ${stat("Silent omissions", 0, "No requested topic absent")}
    </section>
    <section class="panel">
      ${table([
        { label: "Requirement", render: (row) => escapeHtml(row[0]) },
        { label: "Status", render: (row) => `<span class="badge ${row[1] === "COVERED" ? "badge-live" : "badge-watch"}">${escapeHtml(row[1])}</span>` },
        { label: "Delivered", render: (row) => escapeHtml(row[2]) },
        { label: "Residual evidence gap", render: (row) => escapeHtml(row[3]) }
      ], items)}
    </section>
    <section class="panel callout">
      <p class="eyebrow">Major remaining uncertainty</p>
      <h2>The missing artifact is an authority transaction ledger, not another news search.</h2>
      <p>A complete answer needs YEIDA's plot-wise legal entity, CIN/LLPIN, allotment letter, payment, registered lease, possession, plan sanction, construction, completion, cancellation, restoration and re-allotment events. The report exposes this gap rather than filling it with corporate names from unrelated announcements.</p>
    </section>`;
  }

  function displayValue(value) {
    if (value == null || value === "") {
      return "<span class=\"unknown\">Not verified</span>";
    }
    if (Array.isArray(value)) {
      return `<ul>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    }
    if (typeof value === "object") {
      return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
    }
    return escapeHtml(value);
  }

  function renderReraFacts(project) {
    if (!project.reraFacts.length) {
      return `<section class="panel" id="rera-facts">
        <p class="eyebrow">Reviewed RERA facts</p>
        <h2>Unavailable</h2>
        <p>No basis-aware reviewed certificate facts are linked to this project record.</p>
      </section>`;
    }
    const facts = project.reraFacts.map((fact) => `
      <article data-rera-fact>
        <h3>${escapeHtml(reraFactLabels[fact.semanticFactType] || fact.semanticFactType)}</h3>
        <p><strong>${escapeHtml(reraFactValue(fact))}</strong> · ${escapeHtml(fact.reportingQuarter)}</p>
        <p>${escapeHtml(fact.caveat)}</p>
        <small>${escapeHtml(fact.sourceDocumentType.replaceAll("_", " "))} · page ${fact.sourcePage} · document <code>${escapeHtml(fact.sourceDocumentSha256.slice(0, 12))}…</code></small>
      </article>`).join("");
    return `<section class="panel" id="rera-facts">
      <p class="eyebrow">Reviewed RERA facts</p>
      <h2>${escapeHtml(project.reraFactSummary)}</h2>
      <p>These are exact, user-approved, document-declared certificate facts. They are not independent site verification, OC/CC, occupancy, title, inventory, rating or recommendation evidence.</p>
      <div class="source-cards">${facts}</div>
      <p><a class="button-link" href="${root}/downloads/rera-progress.json">Download all reviewed RERA facts</a></p>
    </section>`;
  }

  function renderProjectProof(project) {
    const selected = readWatchlist();
    const saved = selected.savedProjects.includes(project.id);
    const compared = selected.projects.includes(project.id);
    const promoterAvailable =
      project.legalPromoterLabel && project.legalPromoterLabel !== "Unavailable";
    const priceAvailable = project.price && project.price !== "Unavailable";
    const deliveryAvailable = project.delivery && project.delivery !== "Unavailable";
    const sourceCards = project.sources.length ? project.sources.map((source) => `
      <article>
        <h3><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.title)}</a></h3>
        <p>${escapeHtml(source.publisher)} · ${escapeHtml(source.strength)} · published ${escapeHtml(source.date)}</p>
        <small>${escapeHtml(source.usedFor || "Scope unavailable")}. ${escapeHtml(source.notes || "")}</small>
      </article>`).join("") : "<p>Unavailable</p>";
    return `${hero(
      project.projectName,
      "A project proof page separates published identity evidence from delivery, cost and legal evidence that remains unavailable.",
      "Project proof"
    )}
    <section class="project-proof" data-project-proof>
      <div class="proof-actions">
        <a class="entity-link" href="${marketUrl(`${root}/pages/projects.html`)}">← Back to projects</a>
        <button type="button" class="watch-toggle" data-project-save="${escapeHtml(project.id)}" aria-pressed="${saved}">${saved ? "Saved" : "Save"}</button>
        <button type="button" class="watch-toggle" data-compare-project="${escapeHtml(project.id)}" aria-pressed="${compared}">${compared ? "In compare" : "Compare"}</button>
        <a class="button-link" href="${marketUrl(`${root}/pages/calculator.html?project=${encodeURIComponent(project.id)}`)}">Model returns</a>
      </div>
      <section class="panel">
        <p class="eyebrow">Identity</p>
        <div class="detail-grid">
          <div class="detail-field"><span>Project / phase</span><div>${escapeHtml(project.projectName)} · ${escapeHtml(project.phase)}</div></div>
          <div class="detail-field"><span>RERA registration</span><div>${escapeHtml(project.reraNumber || "Unavailable")}</div></div>
          <div class="detail-field"><span>Location</span><div>${escapeHtml(project.location)}</div></div>
          <div class="detail-field"><span>Published promoter</span><div>${escapeHtml(project.legalPromoterLabel || "Unavailable")}</div></div>
        </div>
      </section>
      <section class="panel callout">
        <p class="eyebrow">Rating state</p>
        <h2>NR · Not Rated</h2>
        <p>${escapeHtml(project.ratingReason)}</p>
        <p class="data-note">${project.reraFacts.length
          ? "Reviewed document-declared QPR facts are present, but they do not satisfy independent construction, legal completion, all-in cost, critical-evidence and weighted-coverage rating gates."
          : "No rating is shown because current QPRs, independent construction evidence, all critical evidence and weighted coverage are unavailable."}</p>
      </section>
      <section class="panel">
        <p class="eyebrow">Critical gaps / risks</p>
        <h2>What must not be assumed</h2>
        <ul class="risk-list">${project.criticalMissing.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul>
      </section>
      <section class="two-column">
        <article class="panel">
          <p class="eyebrow">Price evidence</p>
          <h2>${escapeHtml(project.price || "Unavailable")}</h2>
          <p>${priceAvailable
            ? "Published price evidence may be marketing or asking-price evidence. It is not an all-in cost or comparable registered deed unless explicitly stated."
            : "No sourced price, all-in cost components or comparable deed evidence is published for this project record."}</p>
        </article>
        <article class="panel">
          <p class="eyebrow">Delivery layers</p>
          <div class="detail-grid">
            <div class="detail-field"><span>Published delivery / possession evidence</span><div>${escapeHtml(project.delivery || "Unavailable")}</div></div>
            <div class="detail-field"><span>QPR / construction</span><div>${project.reraFacts.length
              ? `<a class="entity-link" href="#rera-facts">${escapeHtml(project.reraFactSummary)}</a>`
              : "Unavailable"}</div></div>
            <div class="detail-field"><span>OC / CC</span><div>Unavailable</div></div>
            <div class="detail-field"><span>Handover / occupancy</span><div>Unavailable</div></div>
          </div>
          ${deliveryAvailable ? "<p class=\"data-note\">A declared date or published possession statement is not proof of completion, OC/CC or occupancy.</p>" : ""}
        </article>
      </section>
      ${renderReraFacts(project)}
      <section class="two-column">
        <article class="panel">
          <p class="eyebrow">Builder / entity</p>
          <h2>${escapeHtml(project.legalPromoterLabel || "Unavailable")}</h2>
          <p>${promoterAvailable
            ? "The published promoter label is evidence-bound, but it does not establish group-wide delivery, financial strength, litigation outcome or every SPV relationship."
            : "The linked disclosure establishes a published project identity only. It does not publish a legal-promoter or SPV relationship in the current static contract."}</p>
        </article>
        <article class="panel">
          <p class="eyebrow">Map handoff</p>
          <h2>Selected project search</h2>
          <p>Open the map with this project search applied. A parent parcel or planning geometry is not treated as a project-phase boundary.</p>
          <a class="button-link" href="${projectMapUrl(project)}">Open selected map context</a>
        </article>
      </section>
      <section class="panel">
        <p class="eyebrow">Conflicts / issues</p>
        <h2>Unavailable</h2>
        <p>No project-specific conflict or issue evidence is published in this static record. This does not establish that none exists.</p>
      </section>
      <section class="panel">
        <p class="eyebrow">Exact source links</p>
        <div class="source-cards">${sourceCards}</div>
      </section>
    </section>`;
  }

  function renderDetail() {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");
    if (projectId) {
      const project = projectCatalog().find((item) => item.id === projectId);
      return project
        ? renderProjectProof(project)
        : `${hero("Project proof unavailable", "The requested project is not in the published static index for this market.", "Project proof")}
          <section class="panel">${emptyState("Try the Projects index or switch to the market where the record is published.")}</section>`;
    }
    const collection = params.get("collection");
    const id = params.get("id");
    const allowed = new Set(["plots", "companies", "interestEvents", "housingProjects", "infrastructure", "clusters"]);
    const record = allowed.has(collection) ? data[collection].find((item) => item.id === id) : null;
    if (!record) {
      return `${hero("Evidence record not found", "The requested record does not exist in this published evidence bundle.", "Detail view")}`;
    }
    const sourceMap = new Map(data.sources.map((source) => [source.id, source]));
    const sources = (record.sourceIds || []).map((sourceId) => sourceMap.get(sourceId)).filter(Boolean);
    const title = record.name || record.company || record.plot || record.id;
    const fields = Object.entries(record).filter(([key]) => !["id", "sourceIds"].includes(key));
    const returnPages = {
      plots: ["Land and allotments", `${root}/pages/land.html`],
      companies: ["Companies and jobs", `${root}/pages/companies.html`],
      interestEvents: ["Companies and jobs", `${root}/pages/companies.html`],
      housingProjects: ["Sector 22D", `${root}/pages/housing-22d.html`],
      infrastructure: ["Infrastructure", `${root}/pages/infrastructure.html`],
      clusters: ["Special clusters", `${root}/pages/clusters.html`]
    };
    const [returnLabel, returnUrl] = returnPages[collection];
    return `${hero(title, record.currentState || "Structured evidence record", collection.replaceAll(/([A-Z])/g, " $1"))}
      <p><a class="entity-link" href="${marketUrl(returnUrl)}">← Back to ${escapeHtml(returnLabel)}</a></p>
      <section class="panel">
        <div class="detail-grid">
          ${fields.map(([key, value]) => `<div class="detail-field"><span>${escapeHtml(key.replaceAll(/([A-Z])/g, " $1"))}</span><div>${displayValue(value)}</div></div>`).join("")}
        </div>
      </section>
      <section class="panel">
        <p class="eyebrow">Evidence sources</p>
        <div class="source-cards">${sources.map((source) => `
          <article>
            <h3><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.title)}</a></h3>
            <p>${escapeHtml(source.publisher)} · ${escapeHtml(source.strength)} · ${escapeHtml(source.date)}</p>
            <small>${escapeHtml(source.notes || source.usedFor)}</small>
          </article>`).join("")}</div>
      </section>`;
  }

  const renderers = {
    home: renderHome,
    about: renderAbout,
    map: renderMap,
    land: renderLand,
    companies: renderCompanies,
    builders: renderBuilders,
    compare: renderCompare,
    projects: renderProjects,
    workforce: renderWorkforce,
    "housing-parity": renderHousingParity,
    timeline: renderTimeline,
    housing: renderHousing,
    infrastructure: renderInfrastructure,
    clusters: renderClusters,
    roadmap: renderRoadmap,
    audit: renderAudit,
    methodology: renderMethodology,
    detail: renderDetail,
    calculator: () => ""
  };

  renderHeader();
  const pageContent = document.getElementById("page-content");
  pageContent.tabIndex = -1;
  pageContent.innerHTML = (renderers[page] || (() => marketUnavailable("Page")))();
  renderFooter();

  function bindWatchlistActions() {
    document.querySelectorAll(".watch-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.dataset.watchKind;
        const id = button.dataset.watchId;
        if (!kind || !id) return;
        const state = readWatchlist();
        const current = state[kind];
        const existing = current.indexOf(id);
        if (existing >= 0) current.splice(existing, 1);
        else if (current.length < 4) current.push(id);
        else {
          button.textContent = "Limit: 4";
          return;
        }
        if (!writeWatchlist(state)) {
          button.textContent = "Storage unavailable";
          return;
        }
        if (page === "compare") {
          pageContent.innerHTML = renderCompare();
          bindWatchlistActions();
        } else {
          document.querySelectorAll(
            `.watch-toggle[data-watch-kind="${kind}"][data-watch-id="${id}"]`
          ).forEach((match) => {
            const selected = state[kind].includes(id);
            match.setAttribute("aria-pressed", String(selected));
            match.textContent = selected ? "Remove" : "+ Compare";
          });
        }
      });
    });
  }
  bindWatchlistActions();

  function refreshProjectPage() {
    pageContent.innerHTML = renderers[page]();
    bindWatchlistActions();
    bindProjectInteractions();
  }

  function bindProjectActionButtons() {
    document.querySelectorAll("button[data-project-save]").forEach((button) => {
      button.addEventListener("click", () => {
        const state = readWatchlist();
        const id = button.dataset.projectSave;
        const index = state.savedProjects.indexOf(id);
        if (index >= 0) state.savedProjects.splice(index, 1);
        else if (state.savedProjects.length < 4) state.savedProjects.push(id);
        else {
          button.textContent = "Limit: 4";
          return;
        }
        if (!writeWatchlist(state)) {
          button.textContent = "Storage unavailable";
          return;
        }
        refreshProjectPage();
      });
    });
    document.querySelectorAll("button[data-compare-project]").forEach((button) => {
      button.addEventListener("click", () => {
        const state = readWatchlist();
        const id = button.dataset.compareProject;
        const index = state.projects.indexOf(id);
        if (index >= 0) state.projects.splice(index, 1);
        else if (state.projects.length < 4) state.projects.push(id);
        else {
          button.textContent = "Limit: 4";
          return;
        }
        if (!writeWatchlist(state)) {
          button.textContent = "Storage unavailable";
          return;
        }
        refreshProjectPage();
      });
    });

  }

  function bindProjectInteractions() {
    bindProjectActionButtons();
    const filterForm = document.querySelector("[data-project-filters]");
    if (filterForm) {
      const updateResults = () => {
        const formData = new FormData(filterForm);
        const url = new URL(window.location.href);
        ["q", "filter", "sort"].forEach((key) => url.searchParams.set(key, String(formData.get(key) || "")));
        window.history.replaceState({}, "", url);
        const results = document.querySelector("[data-project-results]");
        if (results) {
          results.innerHTML = renderProjectResults();
          bindProjectActionButtons();
        }
      };
      filterForm.addEventListener("submit", (event) => {
        event.preventDefault();
        updateResults();
      });
      filterForm.elements.q?.addEventListener("input", updateResults);
    }
  }
  bindProjectInteractions();

  document.querySelectorAll("[data-global-project-search]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = String(new FormData(form).get("q") || "").trim();
      const url = new URL(`${root}/pages/projects.html`, window.location.href);
      url.searchParams.set("market", activeMarket);
      if (query) url.searchParams.set("q", query);
      window.location.assign(url.toString());
    });
  });

  const filter = document.getElementById("land-filter");
  if (filter) {
    filter.addEventListener("input", () => {
      const term = filter.value.trim().toLowerCase();
      const rows = data.plots.filter((item) =>
        JSON.stringify(item).toLowerCase().includes(term)
      );
      document.getElementById("land-table").innerHTML = table([
        { label: "Plot", key: "plot" },
        { label: "Allottee", key: "allottee" },
        { label: "Use", key: "use" },
        { label: "Stage", render: (row) => stageBadge(row.stage) },
        { label: "Evidence", render: (row) => sourceBadge(row.sourceStrength, row.confidence) }
      ], rows);
    });
  }

  const companyFilter = document.getElementById("company-filter");
  if (companyFilter) {
    companyFilter.addEventListener("input", () => {
      const term = companyFilter.value.trim().toLowerCase();
      const rows = data.companies.filter((item) =>
        JSON.stringify(item).toLowerCase().includes(term)
      );
      document.getElementById("company-table").innerHTML = table([
        { label: "Company / facility", render: (row) => entityLink(row, "companies", "name") },
        { label: "What it does", render: (row) => escapeHtml(row.whatTheyDo || row.activity || "Not verified") },
        { label: "How big", render: (row) => escapeHtml(row.scaleEvidence || [row.capexClaim, row.localJobClaim].filter(Boolean).join("; ") || "Not verified") },
        { label: "Corridor intent", render: (row) => escapeHtml(row.corridorIntent || row.facilityName || row.currentState || "Not verified") },
        { label: "Stage", render: (row) => stageBadge(row.stage) },
        { label: "Job evidence", key: "jobEvidence" },
        { label: "Current state", key: "currentState" }
      ], rows);
    });
  }

  function calculateAffordability() {
    const number = (id) => Number(document.getElementById(id).value) || 0;
    const income = number("calc-income");
    const takeHomeShare = number("calc-takehome") / 100;
    const spending = number("calc-spend");
    const savings = number("calc-save");
    const cap = number("calc-cap") / 100;
    const annualRate = number("calc-rate") / 100;
    const years = number("calc-years");
    const down = number("calc-down") / 100;
    const costs = number("calc-costs") / 100;
    const takeHome = income * takeHomeShare;
    const cashAfterNeeds = Math.max(0, takeHome - spending - savings);
    const emi = Math.max(0, Math.min(takeHome * cap, cashAfterNeeds));
    const months = Math.max(1, years * 12);
    const monthlyRate = annualRate / 12;
    const factor = monthlyRate === 0
      ? months
      : (Math.pow(1 + monthlyRate, months) - 1) /
        (monthlyRate * Math.pow(1 + monthlyRate, months));
    const loan = emi * factor;
    const home = down >= 1 ? loan : loan / Math.max(0.01, 1 - down);
    const upfront = home * (down + costs);
    const format = (value) => `Rs ${Math.round(value).toLocaleString("en-IN")}`;
    document.getElementById("calc-result").innerHTML = `
      <div><span>Maximum modelled EMI</span><strong>${format(emi)}</strong></div>
      <div><span>Indicative loan capacity</span><strong>${format(loan)}</strong></div>
      <div><span>Indicative home budget</span><strong>${format(home)}</strong></div>
      <div><span>Modelled upfront cash</span><strong>${format(upfront)}</strong></div>`;
  }

  const calculator = document.querySelector(".calculator-panel");
  if (calculator) {
    calculator.addEventListener("input", calculateAffordability);
    calculateAffordability();
  }

  const timelineSearch = document.getElementById("timeline-search");
  if (timelineSearch) {
    const refreshTimeline = () => {
      const query = timelineSearch.value.trim().toLowerCase();
      const category = document.getElementById("timeline-category").value;
      const stage = document.getElementById("timeline-stage").value;
      const rows = [...data.timelineEvents]
        .filter((event) => !query || JSON.stringify(event).toLowerCase().includes(query))
        .filter((event) => !category || event.category === category)
        .filter((event) => !stage || event.stage === stage)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      document.getElementById("timeline-list").innerHTML = timelineCards(rows);
    };
    timelineSearch.addEventListener("input", refreshTimeline);
    document.getElementById("timeline-category").addEventListener("change", refreshTimeline);
    document.getElementById("timeline-stage").addEventListener("change", refreshTimeline);
  }
})();
