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

  function getVisibleEvents() {
    const source = Array.isArray(events) ? [...events] : [];
    if (settings.showPromoted === false) {
      return source.filter((event) => event.tier !== "paid");
    }
    return source;
  }

  function renderEventsWithSettings() {
    if (typeof events === "undefined" || events.length === 0) {
      return;
    }

    const visibleEvents = getVisibleEvents();
    const eventList = document.querySelector("#event-list");
    const eventCount = document.querySelector("#event-count");

    visibleEvents.sort((left, right) => right.votes - left.votes || left.title.localeCompare(right.title, "ro"));
    eventList.replaceChildren();
    eventCount.textContent = String(visibleEvents.length);

    if (visibleEvents.length === 0) {
      const emptyMessage = settings.showPromoted === false
        ? "Toate evenimentele promovate sunt ascunse în setări."
        : "Nu sunt evenimente disponibile momentan.";
      eventList.append(createElement("p", "loading-events", emptyMessage));
      return;
    }

    for (const event of visibleEvents) {
      eventList.append(createEventCard(event));
    }

    const markerMap = eventMarkers || new Map();
    for (const [id, marker] of markerMap.entries()) {
      const event = events.find((item) => item.id === id);
      if (!event) continue;
      const isVisible = settings.showPromoted !== false || event.tier !== "paid";
      marker.setOpacity(isVisible ? 1 : 0.35);
      marker.setIcon(L.divIcon({
        className: "",
        html: `<div class="event-map-marker${event.id === selectedEventId ? " active" : ""}"><span>${event.votes}</span></div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      }));
    }
  }

  if (typeof window.renderEvents === "function") {
    window.renderEvents = renderEventsWithSettings;
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
      if (typeof window.renderEvents === "function") {
        window.renderEvents();
      }
      const statusMessage = document.querySelector("#status-message");
      if (statusMessage) {
        statusMessage.textContent = "Setările au fost salvate.";
        statusMessage.dataset.state = "success";
      }
    });
  }

  syncSettingsControls();
  switchTab("home");
  if (typeof window.renderEvents === "function") {
    window.renderEvents();
  }
})();
