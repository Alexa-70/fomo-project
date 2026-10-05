(function () {
  const SETTINGS_STORAGE_KEY = "fomo-settings-v1";
  const defaultSettings = { defaultOrigin: "București", showPromoted: true };

  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const settingsDefaultOriginInput = document.querySelector("#settings-default-origin");
  const settingsShowPromotedInput = document.querySelector("#settings-show-promoted");
  const originInput = document.querySelector("#origin");
  const originHint = document.querySelector("#origin-hint");

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return { ...defaultSettings };
      return { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
      return { ...defaultSettings };
    }
  }

  let settings = loadSettings();

  function saveSettings() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }

  function syncSettingsControls() {
    if (settingsDefaultOriginInput) {
      settingsDefaultOriginInput.value = settings.defaultOrigin || "";
    }
    if (settingsShowPromotedInput) {
      settingsShowPromotedInput.checked = settings.showPromoted !== false;
    }

    if (originInput && !originInput.value.trim() && settings.defaultOrigin) {
      originInput.value = settings.defaultOrigin;
      if (originHint) {
        originHint.textContent = `Punct de plecare implicit: ${settings.defaultOrigin}`;
      }
    }
  }

  function switchTab(tabName) {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === tabName;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    tabPanels.forEach((panel) => {
      const isActive = panel.dataset.tabPanel === tabName;
      panel.classList.toggle("active", isActive);
    });
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  if (settingsDefaultOriginInput) {
    settingsDefaultOriginInput.addEventListener("input", (event) => {
      settings.defaultOrigin = event.target.value.trim() || "București";
      saveSettings();
      if (originInput && !originInput.value.trim()) {
        originInput.value = settings.defaultOrigin;
        if (originHint) {
          originHint.textContent = `Punct de plecare implicit: ${settings.defaultOrigin}`;
        }
      }
    });
  }

  if (settingsShowPromotedInput) {
    settingsShowPromotedInput.addEventListener("change", (event) => {
      settings.showPromoted = event.target.checked;
      saveSettings();
      window.FomoSetPromotedVisibility?.(settings.showPromoted);
      const statusMessage = document.querySelector("#status-message");
      if (statusMessage) {
        statusMessage.textContent = "Setările au fost salvate.";
        statusMessage.dataset.state = "success";
      }
    });
  }

  syncSettingsControls();
  window.FomoSetPromotedVisibility?.(settings.showPromoted !== false);
  switchTab("home");
})();
