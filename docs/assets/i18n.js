(function () {
  "use strict";

  const storageKey = "realtyproof-language";
  const defaultLanguage = "en";
  const supportedLanguages = ["en", "hi"];
  let resources = { translations: { en: {}, hi: {} } };
  let activeLanguage = defaultLanguage;

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return { translations: { en: {}, hi: {} }, error };
    }
  }

  function getStoredLanguage() {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return supportedLanguages.includes(stored) ? stored : null;
    } catch (error) {
      return null;
    }
  }

  function persistLanguage(language) {
    try {
      window.localStorage.setItem(storageKey, language);
    } catch (error) {
      // Persistence is a convenience only; the page still works without storage.
    }
  }

  function readInlineResources() {
    const node = document.getElementById("realtyproof-i18n-data");
    if (!node) {
      return resources;
    }
    const parsed = safeJsonParse(node.textContent || "{}");
    if (parsed && parsed.translations) {
      resources = parsed;
    }
    return resources;
  }

  function normaliseLanguage(language) {
    return supportedLanguages.includes(language) ? language : defaultLanguage;
  }

  function lookup(language, key) {
    const table = resources.translations && resources.translations[language];
    if (!table || !Object.prototype.hasOwnProperty.call(table, key)) {
      return undefined;
    }
    const value = table[key];
    return typeof value === "string" ? value : undefined;
  }

  function t(key, options) {
    const opts = options || {};
    const language = normaliseLanguage(opts.language || activeLanguage);
    const translated = lookup(language, key);
    if (translated !== undefined) {
      return translated;
    }
    const fallback = lookup(defaultLanguage, key);
    if (fallback !== undefined) {
      return fallback;
    }
    return opts.fallback || key;
  }

  function apply(root) {
    const scope = root || document;
    const targets = scope.querySelectorAll("[data-i18n]");
    targets.forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });

    const attributeTargets = scope.querySelectorAll("[data-i18n-aria-label]");
    attributeTargets.forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
    });

    document.documentElement.lang = activeLanguage === "hi" ? "hi" : "en";
    document.documentElement.dir = "ltr";
    document.querySelectorAll("[data-language-option]").forEach((button) => {
      const selected = button.dataset.languageOption === activeLanguage;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("is-active", selected);
    });
  }

  function setLanguage(language) {
    activeLanguage = normaliseLanguage(language);
    persistLanguage(activeLanguage);
    apply(document);
    document.dispatchEvent(new CustomEvent("realtyproof:languagechange", {
      detail: { language: activeLanguage }
    }));
    return activeLanguage;
  }

  function getLanguage() {
    return activeLanguage;
  }

  function init(options) {
    const opts = options || {};
    if (opts.resources && opts.resources.translations) {
      resources = opts.resources;
    } else {
      readInlineResources();
    }

    const requested = new URLSearchParams(window.location.search).get("lang");
    activeLanguage = normaliseLanguage(requested || getStoredLanguage() || opts.language || defaultLanguage);
    apply(document);

    document.querySelectorAll("[data-language-option]").forEach((button) => {
      button.addEventListener("click", () => setLanguage(button.dataset.languageOption));
    });

    return {
      language: activeLanguage,
      resources
    };
  }

  window.RealtyProofI18n = {
    apply,
    getLanguage,
    init,
    readInlineResources,
    setLanguage,
    t
  };
})();
