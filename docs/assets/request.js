(function () {
  "use strict";

  const BRIEF_FIELDS = Object.freeze(["projectRera", "evidenceGaps", "questions"]);
  const personalDataPattern = /\b(email|e-mail|phone|mobile|whatsapp|contact\s*number|address|aadhaar|pan\s*card|passport|bank\s*account|upi)\b/i;

  function i18n() {
    return window.RealtyProofI18n;
  }

  function text(key) {
    return i18n().t(key);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function value(id) {
    const node = byId(id);
    return node ? node.value.trim() : "";
  }

  function selectedRequestType() {
    const selected = document.querySelector("[name='requestType']:checked");
    return selected ? selected.value : "evidence";
  }

  function buildBrief() {
    return {
      projectRera: value("project-rera"),
      evidenceGaps: value("evidence-gaps"),
      questions: value("request-questions")
    };
  }

  function hasBriefContent(brief) {
    return BRIEF_FIELDS.some((field) => brief[field].length > 0);
  }

  function hasPersonalDataTerms(brief) {
    return BRIEF_FIELDS.some((field) => personalDataPattern.test(brief[field]));
  }

  function setStatus(message, tone) {
    const status = byId("request-status");
    if (!status) {
      return;
    }
    status.textContent = message;
    status.dataset.tone = tone || "neutral";
  }

  function renderPreview() {
    const brief = buildBrief();
    const preview = byId("brief-preview");
    if (!preview) {
      return brief;
    }

    if (!hasBriefContent(brief)) {
      preview.textContent = text("request.preview.empty");
      return brief;
    }

    const lines = [
      `${text("request.project.label")}: ${brief.projectRera || text("states.unavailable")}`,
      `${text("request.gaps.label")}: ${brief.evidenceGaps || text("states.unavailable")}`,
      `${text("request.questions.label")}: ${brief.questions || text("states.unavailable")}`
    ];
    preview.textContent = lines.join("\n\n");
    return brief;
  }

  function downloadBrief() {
    const brief = renderPreview();
    if (!hasBriefContent(brief)) {
      setStatus(text("request.error.empty"), "error");
      return;
    }
    if (hasPersonalDataTerms(brief)) {
      setStatus(text("request.error.personal"), "error");
      return;
    }

    const requestType = selectedRequestType();
    const payload = JSON.stringify(brief, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const suffix = requestType === "analysis" ? "independent-analysis" : "evidence-request";
    anchor.href = url;
    anchor.download = `realtyproof-${suffix}-brief.json`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus(text("request.download.ready"), "success");
  }

  function syncTypeCards() {
    document.querySelectorAll("[data-request-card]").forEach((card) => {
      const input = card.querySelector("input[type='radio']");
      card.classList.toggle("is-selected", Boolean(input && input.checked));
    });
  }

  function initRequestPage() {
    i18n().init();
    ["project-rera", "evidence-gaps", "request-questions"].forEach((id) => {
      const node = byId(id);
      if (node) {
        node.addEventListener("input", renderPreview);
      }
    });

    document.querySelectorAll("[name='requestType']").forEach((input) => {
      input.addEventListener("change", syncTypeCards);
    });

    const download = byId("download-brief");
    if (download) {
      download.addEventListener("click", downloadBrief);
    }

    document.addEventListener("realtyproof:languagechange", () => {
      renderPreview();
      syncTypeCards();
    });

    renderPreview();
    syncTypeCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRequestPage);
  } else {
    initRequestPage();
  }

  window.RealtyProofRequest = {
    BRIEF_FIELDS,
    buildBrief,
    renderPreview
  };
})();
