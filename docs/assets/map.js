(function () {
  "use strict";

  const host = document.getElementById("reality-map");
  if (!host || !window.L) {
    return;
  }

  const data = window.YEIDA_DATA;
  const regional = window.REGIONAL_MAP_DATA || { sectors: [], landUseClusters: [] };
  const plotManifest = window.LIVE_PLOT_MANIFEST || { layers: [], yeida: {} };
  const marketRegistry = window.REALTYPROOF_MARKETS || { defaultMarket: "gbn", markets: [] };
  const executionStages = window.YEIDA_EXECUTION_STAGES?.stages || [];
  const reportRoot = document.body.dataset.root || ".";
  const pageQuery = new URLSearchParams(window.location.search);
  const rendererMode = pageQuery.get("renderer") === "canvas" ? "canvas" : "svg";
  const map = L.map(host, {
    zoomControl: true,
    preferCanvas: rendererMode === "canvas"
  }).setView([28.256, 77.575], 13);
  window.REALTYPROOF_MAP = map;
  window.REALTYPROOF_MAP_RENDERER = rendererMode;
  map.createPane("sectorContext");
  map.getPane("sectorContext").style.zIndex = "390";
  map.createPane("sectorLabels");
  map.getPane("sectorLabels").style.zIndex = "650";
  map.getPane("sectorLabels").style.pointerEvents = "none";
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const palettes = {
    idea: "#808a90",
    planning: "#b69a2c",
    feasibility: "#b69a2c",
    dpr: "#d99125",
    approval: "#d99125",
    funding: "#0f746f",
    tender: "#0f746f",
    land_acquired: "#0f746f",
    trial: "#276a9e",
    operational: "#188455",
    construction: "#276a9e",
    possessed: "#0f746f",
    approved: "#0f746f",
    allotted: "#d99125",
    loi: "#d99125",
    mou: "#c8a221",
    interest: "#c8a221",
    authority_only: "#808a90",
    failed: "#a94135"
  };

  function safe(value) {
    return String(value ?? "Not verified")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function marker(item, kind) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) {
      return null;
    }
    const color = palettes[item.stage] || "#808a90";
    const point = L.circleMarker([item.lat, item.lon], {
      radius: kind === "infrastructure" ? 7 : 8,
      color: "#fff",
      weight: 2,
      fillColor: color,
      fillOpacity: 0.92
    });
    point.bindPopup(`
      <div class="map-popup">
        <strong>${safe(item.name || item.allottee || item.plot)}</strong>
        <span>${safe(kind)}</span>
        <p>${safe(item.currentState || item.milestone || item.use || item.activity)}</p>
        <small>Stage: ${safe(item.stage)}</small>
      </div>`);
    point.featureKind = kind;
    return point;
  }

  const layers = {
    companies: L.layerGroup(),
    plots: L.layerGroup(),
    housing: L.layerGroup(),
    infrastructure: L.layerGroup(),
    clusters: L.layerGroup(),
    regionalSectors: L.layerGroup(),
    landUseClusters: L.layerGroup()
  };

  const collections = [
    ["companies", data.companies],
    ["plots", data.plots],
    ["housing", data.housingProjects],
    ["infrastructure", data.infrastructure],
    ["clusters", data.clusters]
  ];

  collections.forEach(([kind, items]) => {
    items.forEach((item) => {
      const point = marker(item, kind);
      if (point) {
        point.addTo(layers[kind]);
      }
    });

    layers[kind].addTo(map);
  });

  regional.sectors.forEach((item) => {
    L.circleMarker([item.lat, item.lon], {
      radius: 3,
      color: item.authority === "NOIDA" ? "#704d8f" : "#346b87",
      weight: 1,
      fillOpacity: 0.55
    }).bindPopup(`
      <div class="map-popup">
        <strong>${safe(item.authority)} Sector ${safe(item.sector)}</strong>
        <span>Official OneMap sector centroid</span>
        <p>Designed use: ${safe(item.designedUse)}<br>Current use: ${safe(item.currentUse)}<br>Plots: ${safe(item.plotCount)}</p>
      </div>`).addTo(layers.regionalSectors);
  });

  const landUseColours = {
    "Industrial": "#a94135",
    "Group Housing": "#b66a20",
    "Institutional": "#704d8f",
    "Commercial": "#0f746f",
    "IT/ITES": "#276a9e"
  };
  regional.landUseClusters.forEach((item) => {
    L.circleMarker([item.lat, item.lon], {
      radius: Math.max(4, Math.min(13, Math.sqrt(item.plots) / 3)),
      color: "#fff",
      weight: 1,
      fillColor: landUseColours[item.landUse] || "#808a90",
      fillOpacity: 0.72
    }).bindPopup(`
      <div class="map-popup">
        <strong>${safe(item.authority)} ${safe(item.sector)}</strong>
        <span>${safe(item.landUse)} cluster</span>
        <p>${safe(item.plots)} plot features<br>${safe(Number(item.areaSqm).toLocaleString("en-IN"))} sqm mapped area</p>
        <small>Sector aggregate; not company demand</small>
      </div>`).addTo(layers.landUseClusters);
  });

  const overlays = {
    "Noida/GNIDA sector centroids": layers.regionalSectors,
    "Non-individual land-use clusters": layers.landUseClusters
  };
  const evidenceLabels = {
    companies: "Companies and jobs",
    plots: "YEIDA allotments",
    housing: "Housing",
    infrastructure: "Infrastructure",
    clusters: "Special clusters"
  };
  Object.entries(evidenceLabels).forEach(([key, label]) => {
    if (layers[key].getLayers().length > 0) {
      overlays[label] = layers[key];
    }
  });
  L.control.layers(null, overlays, { collapsed: true }).addTo(map);

  const mapped = collections.reduce((total, [, items]) =>
    total + items.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon)).length, 0) +
    regional.sectors.length + regional.landUseClusters.length;
  const count = document.getElementById("mapped-count");
  if (count) {
    count.textContent = String(mapped);
  }

  const authoritySelect = document.getElementById("plot-authority");
  const categorySelect = document.getElementById("plot-category");
  const landUseDropdown = document.getElementById("land-use-dropdown");
  const landUseSummary = document.getElementById("land-use-summary");
  const landUseCheckboxes = [...document.querySelectorAll("#land-use-options input[type='checkbox']")];
  const statusSelect = document.getElementById("plot-status");
  const loadButton = document.getElementById("load-plots");
  const searchInput = document.getElementById("plot-search");
  const searchButton = document.getElementById("search-plots");
  const resetButton = document.getElementById("reset-map");
  const loadStatus = document.getElementById("plot-load-status");
  const coverageNote = document.getElementById("plot-coverage-note");
  const detailPanel = document.getElementById("plot-detail-panel");
  const legend = document.getElementById("plot-legend");
  const activeLayerSummary = document.getElementById("active-layer-summary");
  const mapShortcuts = [...document.querySelectorAll(
    "[data-map-authority][data-map-category], [data-map-authority][data-map-categories]"
  )];

  if (!authoritySelect || !categorySelect || !loadButton || !window.fetch || !L.geoJSON) {
    return;
  }

  const initialQuery = pageQuery;
  const requestedMarket = initialQuery.get("market") || marketRegistry.defaultMarket;
  const marketAuthority = marketRegistry.markets.find(
    (market) => market.id === requestedMarket
  )?.mapAuthority;
  const requestedAuthority = initialQuery.get("authority") || marketAuthority;
  const requestedCategory = initialQuery.get("category");
  const requestedCategories = (initialQuery.get("categories") || requestedCategory || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const requestedStatus = initialQuery.get("status");
  if ([...authoritySelect.options].some((option) => option.value === requestedAuthority)) {
    authoritySelect.value = requestedAuthority;
  }
  if (requestedCategories.length > 0) {
    const requested = new Set(requestedCategories);
    [...categorySelect.options].forEach((option) => {
      option.selected = requested.has(option.value);
    });
  }
  if (statusSelect && [...statusSelect.options].some((option) => option.value === requestedStatus)) {
    statusSelect.value = requestedStatus;
  }

  const OFFICIAL_COLOURS = {
    commercial: "#ff0000",
    groupHousing: "#ffaa00",
    noidaGnidaIndustry: "#7a8ef5",
    yeidaIndustry: "#a900e6",
    institutional: "#004da8",
    it: "#73dfff",
    residential: "#f0ed17",
    mixedUse: "#ffff73",
    utility: "#b2b2b2",
    facility: "#f57a7a",
    warehouse: "#730000",
    fuel: "#a80000"
  };
  const categoryColours = {
    "industrial": OFFICIAL_COLOURS.noidaGnidaIndustry,
    "commercial": OFFICIAL_COLOURS.commercial,
    "institutional": OFFICIAL_COLOURS.institutional,
    "residential": OFFICIAL_COLOURS.residential,
    "group-housing": OFFICIAL_COLOURS.groupHousing,
    "it-ites": OFFICIAL_COLOURS.it,
    "logistics": "#730000",
    "mixed-use": OFFICIAL_COLOURS.mixedUse,
    "airport-aviation": "#287d9c",
    "special-development": "#6a5acd",
    "riverfront": "#2f8f86",
    "hospitality": OFFICIAL_COLOURS.facility,
    "rera-project-parcels": "#16a34a",
    "sector-boundaries": "#172a3a",
    "residential-masterplan": OFFICIAL_COLOURS.residential,
    "airport-masterplan": "#287d9c",
    "logistics-masterplan": OFFICIAL_COLOURS.warehouse,
    "hospitality-masterplan": OFFICIAL_COLOURS.facility,
    "roads-masterplan": "#5b6268"
  };
  const noidaGnidaUseColours = {
    commercial: OFFICIAL_COLOURS.commercial,
    "group housing": OFFICIAL_COLOURS.groupHousing,
    industrial: OFFICIAL_COLOURS.noidaGnidaIndustry,
    institutional: OFFICIAL_COLOURS.institutional,
    it: OFFICIAL_COLOURS.it,
    residential: OFFICIAL_COLOURS.residential,
    builder: "#ffd37f",
    facility: OFFICIAL_COLOURS.facility,
    utility: OFFICIAL_COLOURS.utility
  };
  const yeidaCommercialColours = {
    commercial: OFFICIAL_COLOURS.commercial,
    "fuel filling station": OFFICIAL_COLOURS.fuel,
    "petrol pump": OFFICIAL_COLOURS.fuel,
    "godown and warehouse": OFFICIAL_COLOURS.warehouse,
    restaurant: OFFICIAL_COLOURS.facility,
    "service station": OFFICIAL_COLOURS.commercial,
    "weigh bridge": OFFICIAL_COLOURS.commercial,
    hotel: OFFICIAL_COLOURS.facility
  };
  const yeidaInstitutionalColours = {
    "a.r.t.o": "#0070ff",
    "admin office": "#f6c567",
    bank: "#6677cd",
    "i.t.i skil development center": "#a8a800",
    "post office": "#e6e600",
    "police station": "#005ce6",
    "fire station": "#ff73df",
    "ats & commando training center": "#00ffc5",
    "convention hall": "#730000",
    facility: "#0070ff",
    institutional: "#004da8"
  };
  const statusOutlines = Object.fromEntries(
    executionStages.map(({ key, color, weight, dashArray }) => [
      key,
      { color, weight, ...(dashArray ? { dashArray } : {}) }
    ])
  );
  function selectedCategories() {
    const selected = [...categorySelect.selectedOptions].map((option) => option.value);
    if (!selected.includes("__all__")) return selected;
    const authority = authoritySelect.value;
    return [...categorySelect.options]
      .map((option) => option.value)
      .filter((category) =>
        category !== "__all__" &&
        plotManifest.layers.some((entry) =>
          (authority === "all" || entry.authority === authority) &&
          entry.category === category &&
          entry.count > 0
        )
      );
  }

  function setSelectedCategories(categories) {
    const selected = new Set(categories);
    [...categorySelect.options].forEach((option) => {
      option.selected = selected.has(option.value);
    });
    landUseCheckboxes.forEach((checkbox) => {
      checkbox.checked = selected.has(checkbox.value);
    });
    updateLandUseSummary();
  }

  function updateLandUseSummary() {
    if (!landUseSummary) return;
    const raw = [...categorySelect.selectedOptions];
    if (raw.some((option) => option.value === "__all__")) {
      landUseSummary.textContent = "All available land uses";
    } else if (raw.length === 0) {
      landUseSummary.textContent = "Select land uses";
    } else if (raw.length <= 2) {
      landUseSummary.textContent = raw.map((option) => option.textContent.trim()).join(" + ");
    } else {
      landUseSummary.textContent = `${raw.length} land uses selected`;
    }
  }

  let currentCategories = selectedCategories();
  setSelectedCategories(
    [...categorySelect.selectedOptions].map((option) => option.value)
  );
  let searchIndex = [];
  let selectedLayers = [];
  let loadedGeojson = null;
  let currentEntries = [];
  let viewportIndex = null;
  const viewportChunkCache = new Map();
  let viewportAbortController = null;
  let viewportLoadTimer = null;
  let viewportMode = false;
  let viewportRequestId = 0;
  let suppressViewportReloadUntil = 0;
  let fallbackReason = "";
  let accessibleList = document.getElementById("plot-accessible-list");
  if (!accessibleList && loadStatus) {
    loadStatus.insertAdjacentHTML("afterend",
      `<div id="viewport-map-status" class="data-note" role="status" aria-live="polite"></div>
       <section id="plot-accessible-list" class="plot-accessible-list" aria-label="Accessible map feature list"></section>`);
    accessibleList = document.getElementById("plot-accessible-list");
  }
  const viewportStatus = document.getElementById("viewport-map-status");
  let sectorBoundaryCache = null;
  let activeSectorCode = "";
  const sectorLabelMarkers = [];
  const sectorContextLayer = L.geoJSON(null, {
    pane: "sectorContext",
    interactive: false,
    style: {
      color: "#334155",
      weight: 1.4,
      dashArray: "5 5",
      fill: false,
      opacity: 0.78
    }
  }).addTo(map);
  const sectorLabelsLayer = L.layerGroup().addTo(map);

  function viewportBBox() {
    const bounds = map.getBounds();
    return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  }

  function bboxIntersects(left, right) {
    return !(
      left[2] < right[0] || left[0] > right[2] ||
      left[3] < right[1] || left[1] > right[3]
    );
  }

  async function loadViewportIndex() {
    if (viewportIndex) return viewportIndex;
    const response = await fetch(`${reportRoot}/data/plots/viewport/index.json`);
    if (!response.ok) throw new Error(`Viewport index: HTTP ${response.status}`);
    viewportIndex = await response.json();
    return viewportIndex;
  }

  async function fetchViewportChunk(chunk, signal) {
    if (viewportChunkCache.has(chunk.file)) {
      return viewportChunkCache.get(chunk.file);
    }
    const response = await fetch(`${reportRoot}/${chunk.file}`, { signal });
    if (!response.ok) throw new Error(`${chunk.file}: HTTP ${response.status}`);
    const payload = await response.json();
    viewportChunkCache.set(chunk.file, payload);
    return payload;
  }

  function selectedViewportChunks(entries, bounds) {
    return entries.flatMap((entry) => {
      const indexed = viewportIndex?.layers.find((item) =>
        item.authority === entry.authority && item.category === entry.category
      );
      return (indexed?.chunks || [])
        .filter((chunk) => bboxIntersects(chunk.bbox, bounds))
        .map((chunk) => ({ entry, chunk }));
    });
  }

  function nearestViewportChunks(entries, limit = 8) {
    const center = map.getCenter();
    return entries.flatMap((entry) => {
      const indexed = viewportIndex?.layers.find((item) =>
        item.authority === entry.authority && item.category === entry.category
      );
      return (indexed?.chunks || []).map((chunk) => {
        const chunkLon = (chunk.bbox[0] + chunk.bbox[2]) / 2;
        const chunkLat = (chunk.bbox[1] + chunk.bbox[3]) / 2;
        return {
          entry,
          chunk,
          distance: Math.hypot(chunkLon - center.lng, chunkLat - center.lat)
        };
      });
    })
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit)
      .map(({ entry, chunk }) => ({ entry, chunk }));
  }

  async function loadViewportChunks(entries, chunks, signal, fitBounds) {
    const payloads = await Promise.all(chunks.map(async ({ entry, chunk }) => ({
      entry,
      payload: await fetchViewportChunk(chunk, signal)
    })));
    const features = payloads.flatMap(({ entry, payload }) =>
      (payload.features || []).map((feature) => ({
        ...feature,
        properties: { ...(feature.properties || {}), category: entry.category }
      }))
    );
    currentEntries = entries;
    currentCategories = [...new Set(entries.map((entry) => entry.category))];
    loadedGeojson = { type: "FeatureCollection", features };
    await loadSectorContext(
      authoritySelect.value,
      currentCategories,
      viewportBBox(),
      signal
    );
    renderLegend(authoritySelect.value, currentCategories);
    renderLoadedPlots(fitBounds);
  }

  function sectorCode(properties) {
    return String(
      properties.industrysector ||
      properties.sector_no ||
      properties.sector ||
      ""
    ).replace(/^SECTOR[-\s]*/i, "").trim();
  }

  function updateSectorLabelVisibility() {
    const acceptedBoxes = [];
    const zoom = map.getZoom();
    const orderedMarkers = [...sectorLabelMarkers].sort((left, right) =>
      Number(right.code === activeSectorCode) - Number(left.code === activeSectorCode)
    );
    orderedMarkers.forEach(({ marker: sectorMarker, code }) => {
      const element = sectorMarker.getElement();
      if (!element) return;
      const point = map.latLngToContainerPoint(sectorMarker.getLatLng());
      const active = code === activeSectorCode;
      const width = zoom >= 13 ? 76 : 96;
      const height = zoom >= 13 ? 26 : 30;
      const box = {
        left: point.x - width / 2,
        right: point.x + width / 2,
        top: point.y - height / 2,
        bottom: point.y + height / 2
      };
      const visible = active || acceptedBoxes.every((placed) =>
        box.right < placed.left || box.left > placed.right ||
        box.bottom < placed.top || box.top > placed.bottom
      );
      element.style.display = visible ? "" : "none";
      element.classList.toggle("active", active);
      if (visible) acceptedBoxes.push(box);
    });
  }

  function highlightSector(properties) {
    activeSectorCode = sectorCode(properties);
    updateSectorLabelVisibility();
  }

  async function loadSectorContext(authority, categories, bounds, signal) {
    sectorContextLayer.clearLayers();
    sectorLabelsLayer.clearLayers();
    sectorLabelMarkers.length = 0;
    activeSectorCode = "";
    if (authority !== "yeida") return;

    if (!sectorBoundaryCache) {
      const entry = plotManifest.layers.find((item) =>
        item.authority === "yeida" && item.category === "sector-boundaries"
      );
      if (!entry) throw new Error("YEIDA sector-boundary layer is unavailable");
      if (viewportIndex && bounds) {
        const indexed = viewportIndex.layers.find((item) =>
          item.authority === entry.authority && item.category === entry.category
        );
        const chunks = (indexed?.chunks || [])
          .filter((chunk) => bboxIntersects(chunk.bbox, bounds))
          .map((chunk) => ({ entry, chunk }));
        const payloads = await Promise.all(chunks.map(({ chunk }) =>
          fetchViewportChunk(chunk, signal)
        ));
        sectorBoundaryCache = {
          type: "FeatureCollection",
          features: payloads.flatMap((payload) => payload.features || [])
        };
      } else {
        const response = await fetch(`${reportRoot}/${entry.file}`, { signal });
        if (!response.ok) throw new Error(`Sector labels: HTTP ${response.status}`);
        sectorBoundaryCache = await response.json();
      }
    }

    if (!categories.includes("sector-boundaries")) {
      sectorContextLayer.addData(sectorBoundaryCache);
    }
    sectorBoundaryCache.features.forEach((feature) => {
      const code = sectorCode(feature.properties || {});
      if (!/^\d+[A-Z]?$/.test(code)) return;
      const bounds = L.geoJSON(feature).getBounds();
      if (!bounds.isValid()) return;
      const sectorMarker = L.marker(bounds.getCenter(), {
        pane: "sectorLabels",
        interactive: false,
        icon: L.divIcon({
          className: "sector-number-marker",
          html: `<span>Sector ${safe(code)}</span>`
        })
      }).addTo(sectorLabelsLayer);
      sectorLabelMarkers.push({ marker: sectorMarker, code });
    });
    updateSectorLabelVisibility();
  }

  map.on("zoomend moveend", updateSectorLabelVisibility);
  map.on("moveend", scheduleViewportReload);

  function executionStatus(properties) {
    return String(properties.execution_stage || "unknown").toLowerCase();
  }

  function landUseColour(properties) {
    const authority = String(properties.authority || "").toUpperCase();
    const category = String(properties.category || currentCategories[0] || "");
    const raw = String(
      properties.landuse_subcategory ||
      properties.ppt_full ||
      properties.property_t ||
      properties.class ||
      properties.category ||
      ""
    ).trim();
    const normalized = raw.toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ").trim();
    if (authority === "YEIDA") {
      if (category === "industrial") return OFFICIAL_COLOURS.yeidaIndustry;
      if (category === "commercial") {
        return yeidaCommercialColours[normalized] || "#ff0000";
      }
      if (category === "institutional") {
        return yeidaInstitutionalColours[normalized] || "#004da8";
      }
      if (category === "mixed-use") return OFFICIAL_COLOURS.mixedUse;
    }
    if (noidaGnidaUseColours[normalized]) return noidaGnidaUseColours[normalized];
    if (normalized === "it/ites") return OFFICIAL_COLOURS.it;
    if (normalized === "mixed use") return OFFICIAL_COLOURS.mixedUse;
    if (normalized.includes("logistic") || normalized.includes("warehouse")) return OFFICIAL_COLOURS.warehouse;
    if (normalized.includes("hotel") || normalized.includes("hospitality")) return OFFICIAL_COLOURS.facility;
    return categoryColours[category] || "#828282";
  }

  function plotStyle(feature) {
    const properties = feature?.properties || {};
    const category = String(properties.category || currentCategories[0] || "");
    if (category === "rera-project-parcels") {
      const confidence = String(properties.match_confidence || "").toUpperCase();
      const method = String(properties.match_method || "");
      const colour = confidence.startsWith("HIGH")
        ? "#16a34a"
        : confidence.startsWith("MEDIUM") ? "#f59e0b" : "#dc2626";
      return {
        color: colour,
        weight: 3,
        dashArray: properties.match_scope === "parent-parcel" ||
          method.includes("spatial") || method.includes("unresolved") ? "6 4" : null,
        fillColor: colour,
        fillOpacity: 0.42
      };
    }
    if (category === "sector-boundaries") {
      return {
        color: categoryColours[category],
        weight: 2,
        dashArray: "7 5",
        fillColor: categoryColours[category],
        fillOpacity: 0.03
      };
    }
    if (category.endsWith("-masterplan")) {
      const status = statusOutlines.planning;
      return {
        color: status.color,
        weight: status.weight,
        dashArray: status.dashArray,
        fillColor: categoryColours[category] || "#54636c",
        fillOpacity: 0.15
      };
    }
    const status = statusOutlines[executionStatus(properties)] || statusOutlines.unknown;
    return {
      color: status.color,
      weight: status.weight,
      dashArray: status.dashArray,
      fillColor: landUseColour(properties),
      fillOpacity: 0.5
    };
  }

  function readableDate(value) {
    if (value == null || value === "" || value === " ") return null;
    if (typeof value === "number" && value > 100000000000) {
      return new Date(value).toLocaleDateString("en-IN");
    }
    return String(value);
  }

  const fieldLabels = {
    authority: "Authority",
    objectid: "GIS object ID",
    plotmapid: "Plot map ID",
    plot_no: "Plot number",
    plotno: "Plot number",
    sector: "Sector",
    block: "Block",
    phase: "Phase",
    ppt_full: "Land use",
    property_t: "Property type",
    mplanduse: "Master-plan code/use",
    plotsizesq: "Area (sqm)",
    plotsize: "Recorded plot size",
    plotsize_at_the_time_of_allotme: "Size at allotment",
    plot_size_as_per_lease_plan: "Lease-plan size",
    area_sqm: "Geometry area (sqm)",
    plot_size: "Recorded plot size",
    scheme_cod: "Scheme code",
    allotted_p: "GIS allotment status",
    used: "Use status",
    allot_id: "Allotment ID",
    allotmentid: "Allotment ID",
    allotment_date: "Allotment date",
    rate_of_allotment: "Allotment rate",
    uniqueplotid: "YEIDA unique plot ID",
    plotmap_id: "YEIDA plot map ID",
    plotidentificationnumber: "Plot identification number",
    industrysector: "Sector",
    landuse_type: "Land use",
    landuse_subcategory: "Subcategory",
    nature_of_allottee: "Allottee legal form",
    authority_recorded_allottee: "Authority-recorded company/LLP/public allottee",
    landallotementtype: "Land allotment type",
    landallotementstatus: "Land allotment status",
    execution_stage: "Derived execution stage",
    display_status: "Map status",
    lease_deed: "Lease deed recorded",
    lease_deed_date: "Lease deed date",
    possession: "Possession recorded",
    possession_date: "Possession date",
    map_approval: "Map approval",
    map_sanctioned_from_planning: "Planning map sanction",
    functional: "Functional status",
    functional_certificate_obtain: "Functional certificate",
    functional_certificate_date: "Functional certificate date",
    investment: "Recorded investment",
    employment: "Recorded employment",
    plot_total_employment: "Recorded total employment",
    projects_cost_in_lacs: "Project cost (lakh)",
    units_under_construction: "Units under construction",
    units_under_production: "Units under production",
    payment_status: "Payment status",
    vacancy: "Vacancy field",
    completion: "Completion status",
    completion_issue_date: "Completion date",
    sector_no: "Sector number",
    department: "Department",
    label: "Master-plan label",
    area_ha: "Area (hectares)",
    class: "Master-plan class",
    total_percentage: "Share of plan (%)",
    allot_date: "Allotment date",
    lease_date: "Lease date",
    posi_date: "Possession date",
    func_date: "Functional date",
    village: "Village",
    village_name: "Village",
    khasra_no: "Khasra number",
    longitude: "Recorded longitude",
    latitude: "Recorded latitude",
    last_edited_date: "GIS last edited",
    physical_status_under_planing_o: "Planning physical status",
    remarks: "Remarks",
    remark: "Remark",
    project_names: "RERA project(s)",
    rera_numbers: "RERA number(s)",
    promoter_legal_entities: "Promoter legal entity/entities",
    project_types: "Project type",
    rera_statuses: "RERA status",
    rera_completion_dates: "RERA completion date(s)",
    official_land_areas_sqm: "Official RERA land area (sqm)",
    rera_parcel_identifiers: "RERA parcel identifier(s)",
    gis_plot_identifier: "YEIDA GIS parcel",
    match_method: "Crosswalk method",
    match_scope: "Mapped scope",
    match_confidence: "Crosswalk confidence",
    mapping_ambiguity: "Boundary / evidence caveat",
    mapping_count: "Registrations on parcel"
  };

  function formatFieldValue(key, value) {
    const readable = readableDate(value);
    if (readable == null) return null;
    if (typeof value === "number" && [
      "area_sqm", "investment", "employment", "plot_total_employment",
      "projects_cost_in_lacs", "units_under_construction", "units_under_production"
    ].includes(key)) {
      return value.toLocaleString("en-IN");
    }
    return readable;
  }

  function publicFieldEntries(properties) {
    return Object.entries(fieldLabels)
      .map(([key, label]) => ({ key, label, value: formatFieldValue(key, properties[key]) }))
      .filter((field) => field.value != null && field.value !== "");
  }

  function publicFields(properties) {
    return publicFieldEntries(properties).map(({ label, value }) => [label, value]);
  }

  function plotTitle(properties) {
    const yeidaLocation = [
      properties.industrysector,
      properties.block,
      properties.plotidentificationnumber || properties.plotno
    ].filter(Boolean).join(" / ");
    return properties.project_names ||
      properties.plotmapid ||
      yeidaLocation ||
      properties.plotmap_id ||
      [properties.sector, properties.block, properties.plot_no].filter(Boolean).join(" / ") ||
    properties.sector_no ||
    properties.label ||
    `GIS feature ${properties.objectid || "unknown"}`;
  }

  function featureKind(category) {
    if (category === "rera-project-parcels") return "RERA-project parcel";
    if (category === "sector-boundaries") return "sector boundary";
    if (category.endsWith("-masterplan")) return "master-plan area";
    return "plot";
  }

  function isContextCategory(category) {
    return category === "sector-boundaries" || category.endsWith("-masterplan");
  }

  function drawPriority(feature) {
    const category = String(feature?.properties?.category || "");
    if (category.endsWith("-masterplan")) return 0;
    if (category === "sector-boundaries") return 1;
    if (category === "rera-project-parcels") return 4;
    return 3;
  }

  function clearSelectedLayers() {
    selectedLayers.forEach((selected) => {
      if (selected._path) delete selected._path.dataset.selected;
      selected.closeTooltip();
      plotLayer.resetStyle(selected);
    });
    selectedLayers = [];
  }

  function highlightLayer(layer) {
    layer.bringToFront();
    layer.setStyle({ color: "#00d9ff", weight: 6, fillOpacity: 0.72 });
    if (layer._path) layer._path.dataset.selected = "true";
  }

  function detailHtml(properties) {
    const fields = publicFieldEntries(properties);
    const kind = featureKind(properties.category || currentCategories[0]);
    const identityGroup = ["Location and identity", ["authority", "industrysector", "sector", "sector_no", "block", "plotno", "plot_no", "plotidentificationnumber"]];
    const technicalGroup = ["Technical GIS identifiers", ["uniqueplotid", "plotmap_id", "plotmapid", "objectid"]];
    const reraGroup = ["RERA project and parcel", ["project_names", "promoter_legal_entities", "project_types", "rera_numbers", "rera_statuses", "rera_completion_dates", "official_land_areas_sqm", "rera_parcel_identifiers", "gis_plot_identifier", "match_method", "match_scope", "match_confidence", "mapping_count", "mapping_ambiguity"]];
    const groups = [
      ...(properties.project_names ? [reraGroup] : []),
      identityGroup,
      ["Land, size and scheme", ["landuse_type", "landuse_subcategory", "ppt_full", "property_t", "class", "plotsize", "plotsizesq", "plotsize_at_the_time_of_allotme", "plot_size_as_per_lease_plan", "area_sqm", "area_ha", "scheme_cod", "village_name", "village", "khasra_no"]],
      ["Allotment and execution", ["nature_of_allottee", "authority_recorded_allottee", "landallotementtype", "landallotementstatus", "allotted_p", "allotmentid", "allot_id", "allotment_date", "allot_date", "rate_of_allotment", "lease_deed", "lease_deed_date", "lease_date", "possession", "possession_date", "posi_date", "map_approval", "map_sanctioned_from_planning", "functional", "functional_certificate_obtain", "functional_certificate_date", "func_date", "completion", "completion_issue_date", "payment_status", "vacancy", "execution_stage", "display_status"]],
      ["Investment and activity", ["investment", "employment", "plot_total_employment", "projects_cost_in_lacs", "units_under_construction", "units_under_production", "physical_status_under_planing_o"]],
      ...(!properties.project_names ? [reraGroup] : []),
      technicalGroup,
      ["Map metadata", ["department", "label", "mplanduse", "total_percentage", "longitude", "latitude", "last_edited_date", "remarks", "remark"]]
    ];
    const used = new Set();
    const sections = groups.map(([title, keys]) => {
      const rows = fields.filter((field) => keys.includes(field.key));
      rows.forEach((field) => used.add(field.key));
      if (rows.length === 0) return "";
      const detailList = `<dl>${rows.map((field) =>
        `<dt>${safe(field.label)}</dt><dd>${safe(field.value)}</dd>`
      ).join("")}</dl>`;
      return title.startsWith("Technical") || title === "Map metadata"
        ? `<details class="plot-detail-section technical-details"><summary>${safe(title)}</summary>${detailList}</details>`
        : `<section class="plot-detail-section"><h4>${safe(title)}</h4>${detailList}</section>`;
    }).join("");
    const remaining = fields.filter((field) => !used.has(field.key));
    const summary = [
      ["Sector", sectorCode(properties)],
      ["Plot", properties.plotidentificationnumber || properties.plotno || properties.plot_no],
      ["Use", properties.landuse_subcategory || properties.landuse_type || properties.category],
      ["Size", properties.plotsize || properties.plot_size || properties.plotsizesq],
      ["Status", properties.display_status || executionStatus(properties).replaceAll("-", " ")]
    ].filter(([, value]) => value != null && value !== "");
    return `<p class="selection-banner">Selected ${safe(kind)} · highlighted on map</p>
      <p class="eyebrow">Official plot details</p>
      <h3>${safe(plotTitle(properties))}</h3>
      <div class="plot-summary-chips">${summary.map(([label, value]) =>
        `<span><b>${safe(label)}</b>${safe(value)}</span>`
      ).join("")}</div>
      ${sections}
      ${remaining.length ? `<section class="plot-detail-section"><h4>Additional fields</h4><dl>${remaining.map((field) =>
        `<dt>${safe(field.label)}</dt><dd>${safe(field.value)}</dd>`
      ).join("")}</dl></section>` : ""}
      <p class="data-note">Official GIS feature retrieved ${safe(plotManifest.generatedAt || "date unavailable")}. Allotment status does not prove payment, lease, possession, current ownership or operation.</p>`;
  }

  function setDetailContent(html, selected) {
    if (!detailPanel) return;
    detailPanel.innerHTML =
      `<button type="button" class="plot-detail-close" aria-label="Close selected plot details">Close</button>${html}`;
    detailPanel.classList.toggle("has-selection", selected);
    detailPanel.setAttribute("role", selected ? "dialog" : "region");
    if (selected) detailPanel.setAttribute("aria-modal", "true");
    else detailPanel.removeAttribute("aria-modal");
    if (selected && window.matchMedia("(max-width: 560px)").matches) {
      requestAnimationFrame(() => {
        detailPanel.scrollTop = 0;
        detailPanel.querySelector(".plot-detail-close")?.focus({ preventScroll: true });
      });
    }
  }

  function resetDetailContent() {
    setDetailContent(
      "<p class=\"eyebrow\">Selected map feature</p><h3>Click a polygon</h3><p>Its official GIS identifiers, use, size, scheme and status fields will appear here.</p>",
      false
    );
  }

  function popupHtml(properties) {
    const important = publicFields(properties).slice(0, 9);
    const kind = featureKind(properties.category || currentCategories[0]);
    return `<div class="map-popup">
      <strong>${safe(plotTitle(properties))}</strong>
      <span>${safe(properties.authority)} · ${safe(kind)} · ${safe(properties.category)}</span>
      <p>${important.map(([label, value]) =>
        `<b>${safe(label)}:</b> ${safe(value)}`
      ).join("<br>")}</p>
      <small>Click keeps the full privacy-safe record open in the side panel.</small>
    </div>`;
  }

  function searchResultsHtml(matches, query) {
    return `<p class="selection-banner">${safe(matches.length)} matching parcels highlighted</p>
      <p class="eyebrow">Developer / project search</p>
      <h3>${safe(query)}</h3>
      <div class="project-search-results">${matches.map(({ properties }) => `
        <article>
          <h4>${safe(properties.project_names || plotTitle(properties))}</h4>
          <p>${safe(properties.promoter_legal_entities || properties.authority_recorded_allottee || "Promoter not verified")}</p>
          <dl>
            <dt>YEIDA parcel</dt><dd>${safe(properties.gis_plot_identifier || properties.plotidentificationnumber || properties.plotno)}</dd>
            <dt>RERA</dt><dd>${safe(properties.rera_numbers || "Not mapped")}</dd>
            <dt>Completion</dt><dd>${safe(properties.rera_completion_dates || "Not verified")}</dd>
            <dt>Sector</dt><dd>${safe(sectorCode(properties))}</dd>
            <dt>Confidence</dt><dd>${safe(properties.match_confidence || "Official GIS geometry")}</dd>
          </dl>
        </article>`).join("")}</div>
      <p class="data-note">Highlighted polygons can share a parent township parcel. Click a polygon for every available official field and boundary caveat.</p>`;
  }

  function unresolvedClaimHtml(claim) {
    return `<p class="selection-banner">No verified parcel to highlight</p>
      <p class="eyebrow">Developer claim check</p>
      <h3>${safe(claim.marketingName || claim.searchName)}</h3>
      <div class="callout">
        <p><strong>Status:</strong> ${safe(claim.status)}</p>
        <p><strong>Claimed location:</strong> ${safe(claim.claimedLocation)}</p>
        <p>${safe(claim.finding)}</p>
        <p class="data-note">Official-source check: ${safe(claim.lastChecked)}. A marketing name is not mapped to another developer's parcel without legal-entity evidence.</p>
      </div>`;
  }

  const plotLayer = L.geoJSON(null, {
    style: plotStyle,
    onEachFeature(feature, layer) {
      const properties = feature.properties || {};
      properties.display_status = executionStatus(properties).replaceAll("-", " ");
      layer.on("add", () => {
        if (layer._path) {
          const category = String(properties.category || "");
          layer._path.dataset.landUse = String(
            properties.landuse_subcategory ||
            properties.ppt_full ||
            properties.property_t ||
            properties.class ||
            properties.category ||
            ""
          ).trim();
          layer._path.dataset.mapStatus = executionStatus(properties);
          layer._path.dataset.mapKind = featureKind(category);
          layer._path.style.pointerEvents =
            currentCategories.length > 1 && isContextCategory(category) ? "none" : "auto";
        }
      });
      const searchText = [
        properties.uniqueplotid,
        properties.plotmap_id,
        properties.plotmapid,
        properties.plot_no,
        properties.plotno,
        properties.sector,
        properties.industrysector,
        properties.sector_no,
        properties.label,
        properties.class,
        properties.block,
        properties.scheme_cod,
        properties.allot_id,
        properties.project_names,
        properties.rera_numbers,
        properties.promoter_legal_entities,
        properties.rera_parcel_identifiers,
        properties.gis_plot_identifier
      ].filter(Boolean).join(" ").toLowerCase();
      searchIndex.push({ searchText, layer, properties });
      layer.bindPopup(popupHtml(properties), { maxWidth: 320 });
      if (properties.category === "rera-project-parcels" && properties.project_names) {
        const names = String(properties.project_names).split(" | ");
        const label = names.length > 2
          ? `${names.slice(0, 2).join(" / ")} +${names.length - 2}`
          : names.join(" / ");
        layer.bindTooltip(label, {
          permanent: false,
          direction: "center",
          className: "project-parcel-label"
        });
      }
      layer.on({
        click() {
          clearSelectedLayers();
          selectedLayers = [layer];
          highlightLayer(layer);
          layer.closePopup();
          layer.openTooltip();
          setDetailContent(detailHtml(properties), true);
          highlightSector(properties);
          setStatus(`Selected ${featureKind(properties.category)}: ${plotTitle(properties)}`, false);
        },
        mouseover() {
          if (!selectedLayers.includes(layer)) {
            layer.setStyle({ weight: 2, fillOpacity: 0.5 });
            if (properties.category === "rera-project-parcels") layer.openTooltip();
          }
        },
        mouseout() {
          if (!selectedLayers.includes(layer)) {
            plotLayer.resetStyle(layer);
            if (properties.category === "rera-project-parcels") layer.closeTooltip();
          }
        }
      });
    }
  }).addTo(map);

  map.on("click", (event) => {
    if (!event.originalEvent?.target?.classList?.contains("leaflet-interactive") && selectedLayers.length) {
      clearSelectedLayers();
    }
  });

  function setStatus(message, error) {
    if (!loadStatus) return;
    loadStatus.textContent = message;
    loadStatus.classList.toggle("error", Boolean(error));
  }

  function renderAccessibleList(features, unavailable = false) {
    if (!accessibleList) return;
    const items = features.slice(0, 120).map((feature) => {
      const properties = feature.properties || {};
      return `<li><strong>${safe(plotTitle(properties))}</strong> · ${safe(
        properties.authority || "Authority unavailable"
      )} · ${safe(properties.category || "map feature")}</li>`;
    });
    accessibleList.innerHTML = unavailable
      ? `<p class="eyebrow">Accessible fallback list</p>
         <p>Map polygons are unavailable. ${features.length ? "Loaded records remain available below." : "Use the original GeoJSON fallback or source links."}</p>
         ${items.length ? `<ol>${items.join("")}</ol>` : ""}`
      : `<details><summary>Accessible list (${features.length.toLocaleString("en-IN")} loaded)</summary>
         ${items.length ? `<ol>${items.join("")}</ol>` : "<p>No features in this viewport.</p>"}</details>`;
  }

  function setViewportStatus(message, error = false) {
    if (!viewportStatus) return;
    viewportStatus.textContent = message;
    viewportStatus.classList.toggle("error", error);
  }

  function updateShortcutState(authority, categories) {
    const activeCategories = [...categories].sort().join(",");
    const allAvailable = [...categorySelect.options]
      .map((option) => option.value)
      .filter((category) =>
        category !== "__all__" &&
        plotManifest.layers.some((entry) =>
          entry.authority === authority && entry.category === category && entry.count > 0
        )
      )
      .sort()
      .join(",");
    mapShortcuts.forEach((button) => {
      let shortcutCategories = String(
        button.dataset.mapCategories || button.dataset.mapCategory || ""
      ).split(",").filter(Boolean).sort().join(",");
      if (shortcutCategories === "__all__") shortcutCategories = allAvailable;
      const active = button.dataset.mapAuthority === authority &&
        shortcutCategories === activeCategories &&
        !button.dataset.mapSearch;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function updateActiveLayer(authority, categories, visible, total) {
    if (!activeLayerSummary) return;
    const authorityLabel = authority === "all"
      ? "GBN Overview (all authorities)"
      : authority === "yeida"
        ? "YEIDA"
        : authority === "gnida" ? "Greater Noida (GNIDA)" : "Noida";
    const categoryLabel = categories.map((category) => category.replaceAll("-", " ")).join(" + ");
    activeLayerSummary.innerHTML = `<strong>${safe(authorityLabel)} · ${safe(categoryLabel)}</strong>
      <span>${safe(visible)}${visible === total ? "" : ` of ${safe(total)}`} official clickable polygons shown</span>`;
  }

  function updateShareableUrl(authority, categories) {
    const query = new URLSearchParams(window.location.search);
    query.set("authority", authority);
    query.set("categories", categories.join(","));
    query.delete("category");
    const status = statusSelect?.value || "";
    if (status) query.set("status", status);
    else query.delete("status");
    query.delete("search");
    window.history.replaceState(null, "", `${window.location.pathname}?${query.toString()}`);
  }

  function legendFill(colour, label, dashed) {
    const border = dashed ? `2px dashed ${colour}` : `1px solid ${colour}`;
    const background = dashed ? "transparent" : colour;
    return `<span><i class="legend-swatch" style="border:${border};background:${background}"></i>${safe(label)}</span>`;
  }

  function legendLine(style, label) {
    const dash = style.dashArray ? "dashed" : "solid";
    return `<span><i class="legend-line" style="border-color:${style.color};border-top-style:${dash}"></i>${safe(label)}</span>`;
  }

  function renderLegend(authority, categories) {
    if (!legend) return;
    const category = categories[0] || "";
    const fills = [];
    if (authority === "all") {
      categories.forEach((item) => {
        if (item === "industrial") {
          fills.push(
            legendFill(OFFICIAL_COLOURS.noidaGnidaIndustry, "industrial (Noida / GNIDA)"),
            legendFill(OFFICIAL_COLOURS.yeidaIndustry, "industrial (YEIDA)")
          );
        } else {
          fills.push(legendFill(
            categoryColours[item] || "#828282",
            item.replaceAll("-", " "),
            item === "sector-boundaries" || item.endsWith("-masterplan")
          ));
        }
      });
    } else if (categories.length > 1) {
      categories.forEach((item) => {
        const colour = authority === "yeida" && item === "industrial"
          ? OFFICIAL_COLOURS.yeidaIndustry
          : categoryColours[item] || "#828282";
        fills.push(legendFill(
          colour,
          item.replaceAll("-", " "),
          item === "sector-boundaries" || item.endsWith("-masterplan")
        ));
      });
    } else if (category === "sector-boundaries") {
      fills.push(legendFill(categoryColours[category], "Sector boundary", true));
    } else if (category === "rera-project-parcels") {
      fills.push(
        legendFill("#16a34a", "High-confidence match"),
        legendFill("#f59e0b", "Medium-confidence match"),
        legendFill("#dc2626", "Low / unresolved confidence")
      );
    } else if (category.endsWith("-masterplan")) {
      fills.push(legendFill(categoryColours[category] || "#828282", category.replaceAll("-", " "), true));
    } else if (authority === "yeida" && category === "commercial") {
      fills.push(
        legendFill(yeidaCommercialColours.commercial, "Commercial"),
        legendFill(yeidaCommercialColours["fuel filling station"], "Fuel station"),
        legendFill(yeidaCommercialColours["godown and warehouse"], "Warehouse"),
        legendFill(yeidaCommercialColours.hotel, "Hotel / restaurant")
      );
    } else if (authority === "yeida" && category === "institutional") {
      Object.entries(yeidaInstitutionalColours).forEach(([label, colour]) => {
        fills.push(legendFill(colour, label));
      });
    } else {
      const colour = authority === "yeida" && category === "industrial"
        ? OFFICIAL_COLOURS.yeidaIndustry
        : categoryColours[category] || "#828282";
      fills.push(legendFill(colour, category.replaceAll("-", " ")));
    }

    const statuses = executionStages.map(({ key, label }) =>
      legendLine(statusOutlines[key], label)
    );

    const fillHeading = category === "rera-project-parcels" ? "Fill: match confidence" : "Fill: land use";
    const scope = category === "rera-project-parcels"
      ? `<strong class="legend-heading">Outline: mapped scope</strong>${legendLine({ color: "#334155", dashArray: "6 4" }, "Dashed = shared parent / spatial / unresolved")}`
      : "";
    const statusSection = category === "rera-project-parcels"
      ? ""
      : `<strong class="legend-heading">Outline: status</strong>${statuses.join("")}`;
    legend.innerHTML = `<strong class="legend-heading">${fillHeading}</strong>${fills.join("")}${scope}${statusSection}`;
  }

  function renderLoadedPlots(fitBounds) {
    if (!loadedGeojson || currentEntries.length === 0) return;
    const requestedStatus = statusSelect?.value || "";
    const features = loadedGeojson.features
      .filter((feature) =>
        !requestedStatus || executionStatus(feature.properties || {}) === requestedStatus
      )
      .sort((left, right) => drawPriority(left) - drawPriority(right));
    clearSelectedLayers();
    searchIndex = [];
    plotLayer.clearLayers();
    plotLayer.addData({ type: "FeatureCollection", features });
    const bounds = plotLayer.getBounds();
    if (fitBounds && bounds.isValid()) {
      map.stop();
      map.fitBounds(bounds, { padding: [24, 24], animate: false });
    }
    const kind = currentCategories.length === 1
      ? featureKind(currentCategories[0])
      : "map feature";
    const visible = features.length.toLocaleString("en-IN");
    const totalCount = currentEntries.reduce((sum, entry) => sum + entry.count, 0);
    const total = totalCount.toLocaleString("en-IN");
    updateActiveLayer(authoritySelect.value, currentCategories, visible, total);
    updateShortcutState(authoritySelect.value, currentCategories);
    setStatus(
      `${visible}${requestedStatus ? ` of ${total}` : ""} clickable ${kind}${features.length === 1 ? "" : "s"} loaded`,
      false
    );
    if (coverageNote) {
      const statusText = requestedStatus ? `, filtered to ${requestedStatus.replaceAll("-", " ")}` : "";
      const authorities = [...new Set(currentEntries.map((entry) => entry.authority.toUpperCase()))];
      coverageNote.textContent = currentCategories.length === 1 &&
        currentCategories[0] === "rera-project-parcels"
        ? `UP-RERA registrations crosswalked to YEIDA OneMap parcels${statusText}, mapped ${plotManifest.reraYeida?.mappedAt || "date unavailable"}. Colour shows match confidence; shared parent polygons do not establish project-phase boundaries.`
        : `${authorities.join(" + ")} ${currentCategories.map((item) => item.replaceAll("-", " ")).join(" + ")} layer set${statusText}, retrieved ${new Date(plotManifest.generatedAt).toLocaleString("en-IN")}. Fill colour follows official land-use conventions; outline/dashes show map status. GIS status is not a title certificate.`;
    }
    renderAccessibleList(features);
    setViewportStatus(
      viewportMode
        ? `Viewport delivery: ${features.length.toLocaleString("en-IN")} features from intersecting cached chunks.`
        : `Original GeoJSON fallback active${fallbackReason ? `: ${fallbackReason}` : ""}.`
    );
    setDetailContent(
      `<p class="eyebrow">Selected map feature</p><h3>${visible} ${kind}${features.length === 1 ? "" : "s"} ready</h3><p>Click any coloured polygon, or search by plot ID, plot number, sector or master-plan label.</p>`,
      false
    );
  }

  async function loadPlots() {
    if (landUseDropdown) landUseDropdown.open = false;
    clearTimeout(viewportLoadTimer);
    viewportAbortController?.abort();
    viewportRequestId += 1;
    const authority = authoritySelect.value;
    const categories = selectedCategories();
    if (categories.length === 0) {
      setStatus("Select at least one land use", true);
      return;
    }
    if (["yeida", "all"].includes(authority) && plotManifest.yeida?.status !== "live") {
      plotLayer.clearLayers();
      searchIndex = [];
      loadedGeojson = null;
      currentEntries = [];
      setStatus("YEIDA GIS backend unavailable", true);
      if (coverageNote) {
        coverageNote.innerHTML = `The official <a href="${safe(plotManifest.yeida?.portal)}" target="_blank" rel="noopener">YEIDA ONE citizen portal</a> is live, but its ArcGIS Web Adaptor reported no accessible server machines on 16 August 2026. No polygon is fabricated or substituted.`;
      }
      return;
    }

    const entries = plotManifest.layers.filter((item) =>
      (authority === "all" || item.authority === authority) &&
      categories.includes(item.category) &&
      item.count > 0
    );
    if (entries.length === 0) {
      plotLayer.clearLayers();
      searchIndex = [];
      loadedGeojson = null;
      currentEntries = [];
      setStatus("No live features in this layer", true);
      return;
    }

    loadButton.disabled = true;
    const expected = entries.reduce((sum, entry) => sum + entry.count, 0);
    fallbackReason = "";
    setStatus(`Loading viewport for up to ${expected.toLocaleString("en-IN")} features...`, false);
    try {
      await loadViewportIndex();
      let chunks = selectedViewportChunks(entries, viewportBBox());
      const fitNearest = chunks.length === 0;
      if (fitNearest) chunks = nearestViewportChunks(entries);
      if (chunks.length === 0) throw new Error("No viewport chunks are registered for this layer");
      viewportMode = true;
      viewportAbortController = new AbortController();
      await loadViewportChunks(entries, chunks, viewportAbortController.signal, fitNearest);
      updateShareableUrl(authority, currentCategories);
    } catch (error) {
      viewportMode = false;
      fallbackReason = error.name === "AbortError" ? "request cancelled" : error.message;
      setViewportStatus(
        `Viewport delivery unavailable; loading the original immutable GeoJSON instead. ${fallbackReason}`,
        true
      );
      try {
        const payloads = await Promise.all(entries.map(async (entry) => {
          const response = await fetch(`${reportRoot}/${entry.file}`);
          if (!response.ok) throw new Error(`${entry.category}: HTTP ${response.status}`);
          const geojson = await response.json();
          geojson.features.forEach((feature) => {
            feature.properties = { ...(feature.properties || {}), category: entry.category };
          });
          return geojson;
        }));
        currentCategories = [...new Set(entries.map((entry) => entry.category))];
        loadedGeojson = {
          type: "FeatureCollection",
          features: payloads.flatMap((payload) => payload.features)
        };
        currentEntries = entries;
        await loadSectorContext(authority, currentCategories);
        renderLegend(authority, currentCategories);
        renderLoadedPlots(true);
      } catch (fallbackError) {
        renderAccessibleList([], true);
        setStatus(`Plot load failed: ${fallbackError.message}`, true);
        setViewportStatus(
          `Viewport and original GeoJSON delivery failed. ${fallbackError.message}`,
          true
        );
      }
    } finally {
      loadButton.disabled = false;
    }
  }

  async function reloadViewportForMap() {
    if (!viewportMode || currentEntries.length === 0) return;
    const requestId = ++viewportRequestId;
    viewportAbortController?.abort();
    viewportAbortController = new AbortController();
    try {
      const chunks = selectedViewportChunks(currentEntries, viewportBBox());
      await loadViewportChunks(
        currentEntries,
        chunks,
        viewportAbortController.signal,
        false
      );
      if (requestId !== viewportRequestId) return;
      setStatus(
        `${loadedGeojson.features.length.toLocaleString("en-IN")} viewport features loaded`,
        false
      );
    } catch (error) {
      if (error.name !== "AbortError") {
        setViewportStatus(`Viewport refresh failed: ${error.message}`, true);
      }
    }
  }

  function scheduleViewportReload() {
    if (!viewportMode) return;
    if (Date.now() < suppressViewportReloadUntil) return;
    clearTimeout(viewportLoadTimer);
    viewportLoadTimer = setTimeout(() => {
      reloadViewportForMap();
    }, 180);
  }

  async function loadAllViewportChunksForSearch() {
    if (!viewportMode || currentEntries.length === 0) return;
    const requestId = ++viewportRequestId;
    viewportAbortController?.abort();
    viewportAbortController = new AbortController();
    const chunks = selectedViewportChunks(
      currentEntries,
      [-180, -90, 180, 90]
    );
    await loadViewportChunks(
      currentEntries,
      chunks,
      viewportAbortController.signal,
      false
    );
    if (requestId !== viewportRequestId) return;
    setViewportStatus(
      `Search expanded to ${chunks.length} relevant viewport chunks; original GeoJSON was not fetched.`
    );
  }

  async function findPlot() {
    const query = (searchInput?.value || "").trim().toLowerCase();
    if (!query) {
      setStatus("Enter a developer, project, RERA number, plot ID or sector", true);
      return;
    }
    let exact = /[\d/-]/.test(query)
      ? searchIndex.find((item) => item.searchText.split(" ").includes(query))
      : null;
    let matches = exact ? [exact] : searchIndex.filter((item) => item.searchText.includes(query));
    if (matches.length === 0 && viewportMode) {
      try {
        await loadAllViewportChunksForSearch();
        exact = /[\d/-]/.test(query)
          ? searchIndex.find((item) => item.searchText.split(" ").includes(query))
          : null;
        matches = exact ? [exact] : searchIndex.filter((item) => item.searchText.includes(query));
      } catch (error) {
        setViewportStatus(`Search chunk request failed: ${error.message}`, true);
      }
    }
    if (matches.length === 0 && authoritySelect.value === "yeida") {
      const knownProject = data.reraYeidaPlotMappings.some((mapping) =>
        JSON.stringify(mapping).toLowerCase().includes(query)
      );
      if (knownProject) {
        setSelectedCategories(["rera-project-parcels"]);
        await loadPlots();
        exact = /[\d/-]/.test(query)
          ? searchIndex.find((item) => item.searchText.split(" ").includes(query))
          : null;
        matches = exact ? [exact] : searchIndex.filter((item) => item.searchText.includes(query));
      }
    }
    if (matches.length === 0) {
      const unresolved = (data.housingParity.unresolvedDeveloperClaims || []).find((claim) =>
        JSON.stringify(claim).toLowerCase().includes(query)
      );
      if (unresolved) {
        clearSelectedLayers();
        setDetailContent(unresolvedClaimHtml(unresolved), true);
        setStatus(`${unresolved.searchName}: no verified YEIDA plot or RERA project`, true);
        return;
      }
      setStatus(`No mapped plot or project matches "${query}"`, true);
      return;
    }
    const bounds = L.featureGroup(matches.map((match) => match.layer)).getBounds();
    if (bounds.isValid()) {
      suppressViewportReloadUntil = Date.now() + 750;
      map.stop();
      map.fitBounds(bounds, { maxZoom: 18, padding: [80, 80], animate: false });
    }
    if (matches.length === 1) {
      matches[0].layer.fire("click");
    } else {
      clearSelectedLayers();
      selectedLayers = matches.map((match) => match.layer);
      selectedLayers.forEach((layer) => {
        highlightLayer(layer);
        layer.openTooltip();
      });
      highlightSector(matches[0].properties);
      setDetailContent(searchResultsHtml(matches, searchInput.value.trim()), true);
    }
    setStatus(
      matches.length === 1
        ? `Found ${plotTitle(matches[0].properties)}`
        : `Found and highlighted ${matches.length} matching project parcels`,
      false
    );
    const queryParams = new URLSearchParams(window.location.search);
    queryParams.set("search", searchInput.value.trim());
    window.history.replaceState(null, "", `${window.location.pathname}?${queryParams.toString()}`);
  }

  loadButton.addEventListener("click", loadPlots);
  landUseCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.value === "__all__" && checkbox.checked) {
        setSelectedCategories(["__all__"]);
      } else {
        const categories = landUseCheckboxes
          .filter((item) => item.value !== "__all__" && item.checked)
          .map((item) => item.value);
        setSelectedCategories(categories);
      }
      renderLegend(authoritySelect.value, selectedCategories());
    });
  });
  document.addEventListener("click", (event) => {
    if (landUseDropdown?.open && !landUseDropdown.contains(event.target)) {
      landUseDropdown.open = false;
    }
  });
  landUseDropdown?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      landUseDropdown.open = false;
      landUseDropdown.querySelector("summary")?.focus();
    }
  });
  landUseDropdown?.addEventListener("toggle", () => {
    landUseSummary?.setAttribute("aria-expanded", String(landUseDropdown.open));
  });
  landUseSummary?.setAttribute("aria-expanded", String(Boolean(landUseDropdown?.open)));
  searchButton?.addEventListener("click", findPlot);
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      findPlot();
    }
  });
  authoritySelect.addEventListener("change", () => {
    if (authoritySelect.value === "yeida" && plotManifest.yeida?.status !== "live") {
      setStatus("YEIDA GIS backend unavailable", true);
    } else {
      setStatus("Ready", false);
    }
    renderLegend(authoritySelect.value, selectedCategories());
  });
  categorySelect.addEventListener("change", () =>
    renderLegend(authoritySelect.value, selectedCategories())
  );
  resetButton?.addEventListener("click", async () => {
    authoritySelect.value = marketAuthority || "all";
    setSelectedCategories(["industrial"]);
    if (statusSelect) statusSelect.value = "";
    if (searchInput) searchInput.value = "";
    clearSelectedLayers();
    resetDetailContent();
    await loadPlots();
  });
  detailPanel?.addEventListener("click", (event) => {
    if (!event.target.closest(".plot-detail-close")) return;
    clearSelectedLayers();
    resetDetailContent();
    host.focus({ preventScroll: true });
  });
  detailPanel?.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !detailPanel.classList.contains("has-selection") ||
        !window.matchMedia("(max-width: 560px)").matches) return;
    const focusable = [...detailPanel.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), summary'
    )].filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (document.getElementById("mobile-navigation")?.open) return;
    if (event.key !== "Escape" || !detailPanel?.classList.contains("has-selection")) return;
    clearSelectedLayers();
    resetDetailContent();
    host.focus({ preventScroll: true });
  });
  mapShortcuts.forEach((button) => {
    button.addEventListener("click", async () => {
      authoritySelect.value = button.dataset.mapAuthority;
      setSelectedCategories(
        String(button.dataset.mapCategories || button.dataset.mapCategory || "")
          .split(",")
          .filter(Boolean)
      );
      if (landUseDropdown) landUseDropdown.open = false;
      if (statusSelect) statusSelect.value = "";
      if (searchInput) searchInput.value = button.dataset.mapSearch || "";
      await loadPlots();
      if (button.dataset.mapSearch) findPlot();
      host.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  });

  renderLegend(authoritySelect.value, selectedCategories());
  updateShortcutState(authoritySelect.value, selectedCategories());
  loadPlots().then(async () => {
    const initialSearch = initialQuery.get("search");
    if (initialSearch && searchInput) {
      searchInput.value = initialSearch;
      await findPlot();
      host.scrollIntoView({ block: "center", behavior: "auto" });
    }
  });
})();
