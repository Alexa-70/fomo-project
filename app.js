const API_BASE_URL = "http://localhost:5101";
const DEFAULT_ORIGIN = { latitude: 46.7712, longitude: 23.6236 };

const originInput = document.querySelector("#origin");
const originSuggestions = document.querySelector("#origin-suggestions");
const originHint = document.querySelector("#origin-hint");
const locateButton = document.querySelector("#locate-button");
const eventList = document.querySelector("#event-list");
const eventCount = document.querySelector("#event-count");
const eventSearchInput = document.querySelector("#event-search");
const communityList = document.querySelector("#community-list");
const categoryFilterButtons = document.querySelectorAll(".category-filter");
const statusMessage = document.querySelector("#status-message");
const mapHint = document.querySelector("#map-hint");

/* ==================== HARTĂ LEAFLET ==================== */
const map = L.map("map", { zoomControl: false, minZoom: 1 })
  .setView([DEFAULT_ORIGIN.latitude, DEFAULT_ORIGIN.longitude], 13);

L.maplibreGL({
  style: "https://tiles.openfreemap.org/styles/bright",
  attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap',
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

// 🔥 FIX CRUCIAL: forțează Leaflet să calculeze dimensiunea corect
setTimeout(() => map.invalidateSize(), 100);
window.addEventListener("resize", () => map.invalidateSize());

/* ==================== STARE GLOBALĂ ==================== */
let origin = { ...DEFAULT_ORIGIN };
let events = [];
let selectedEventId = null;
let activeCategory = "all";
let eventSearchQuery = "";
let routeLayer = null;
let originMarker = null;
let routeDestinationMarker = null;
let eventMarkers = new Map();
let searchTimer = null;
let searchRequestId = 0;

window.FomoAppContext = {
  getEvents: () => events.map((event) => ({ ...event })),
  getOrigin: () => ({ ...origin }),
  getSelectedEventId: () => selectedEventId,
};

const voterId = (() => {
  const storageKey = "locally-voter-id";
  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, id);
  }
  return id;
})();

/* ==================== PANOU PLUTITOR (DRAG + MINIMIZE) ==================== */
const floatingPanel = document.getElementById("floating-panel");
const panelDragHandle = document.getElementById("panel-drag-handle");
const panelToggle = document.getElementById("panel-toggle");

panelToggle.addEventListener("click", () => {
  floatingPanel.classList.toggle("minimized");
  const isMin = floatingPanel.classList.contains("minimized");
  panelToggle.querySelector(".toggle-icon").textContent = isMin ? "+" : "−";
  panelToggle.setAttribute("aria-label", isMin ? "Maximizează panoul" : "Minimizează panoul");
  setTimeout(() => map.invalidateSize(), 250);
});

let dragState = null;

function getClientPoint(e) {
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function startDrag(e) {
  if (e.target.closest(".panel-toggle")) return;

  const rect = floatingPanel.getBoundingClientRect();
  const point = getClientPoint(e);

  floatingPanel.style.left = rect.left + "px";
  floatingPanel.style.top = rect.top + "px";
  floatingPanel.style.right = "auto";
  floatingPanel.style.bottom = "auto";
  floatingPanel.style.transition = "none";

  dragState = {
    offsetX: point.x - rect.left,
    offsetY: point.y - rect.top,
  };

  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", endDrag);
  document.addEventListener("touchmove", onDragMove, { passive: false });
  document.addEventListener("touchend", endDrag);
}

function onDragMove(e) {
  if (!dragState) return;
  e.preventDefault();
  const point = getClientPoint(e);
  const panelWidth = floatingPanel.offsetWidth;
  const panelHeight = floatingPanel.offsetHeight;

  let newLeft = point.x - dragState.offsetX;
  let newTop = point.y - dragState.offsetY;

  newLeft = Math.max(8, Math.min(window.innerWidth - panelWidth - 8, newLeft));
  newTop = Math.max(8, Math.min(window.innerHeight - panelHeight - 8, newTop));

  floatingPanel.style.left = newLeft + "px";
  floatingPanel.style.top = newTop + "px";
}

function endDrag() {
  dragState = null;
  floatingPanel.style.transition = "";
  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", endDrag);
  document.removeEventListener("touchmove", onDragMove);
  document.removeEventListener("touchend", endDrag);
}

panelDragHandle.addEventListener("mousedown", startDrag);
panelDragHandle.addEventListener("touchstart", startDrag, { passive: true });

/* ==================== UTILITARE ==================== */
function setStatus(message, state = "") {
  statusMessage.textContent = message;
  if (state) statusMessage.dataset.state = state;
  else delete statusMessage.dataset.state;
}

function formatDistance(meters) {
  return meters >= 1000
    ? `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 }).format(meters / 1000)} km`
    : `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Cererea către server nu a reușit.");
  return data;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ro-RO", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function normalizeCategory(category) {
  if (!category) return "";
  const normalized = category.trim();
  const aliases = {
    "Muzică": "Music",
    "Outdoor": "Sports",
    "Film": "Cinema",
    "Food & drink": "Food & Drink",
    "Food & Drink": "Food & Drink",
    "Food & drink ": "Food & Drink",
    "Party & Nightlife": "Party",
    "Sports & Outdoor": "Sports",
    "Cinema & Cultură": "Cinema",
    "Live Music & Stand-up": "Music",
    "Board Games & Quiz": "Quiz",
    "Board Games": "Quiz",
    "Workshops & Networking": "Social",
  };
  return aliases[normalized] || normalized;
}

function getCategoryTagClass(category) {
  switch (normalizeCategory(category)) {
    case "Social": return "tag-social";
    case "Food & Drink": return "tag-food";
    case "Party": return "tag-party";
    case "Sports": return "tag-sports";
    case "Cinema": return "tag-cinema";
    case "Quiz": return "tag-quiz";
    case "Community": return "tag-social";
    default: return "tag-default";
  }
}

/* ==================== MARKERE ==================== */
function createEventMarker(event) {
  const markerIcon = L.divIcon({
    className: "",
    html: `<div class="event-map-marker-wrap"><div class="event-map-marker${event.tier === "paid" ? " promoted" : ""}"><span>${event.votes}</span></div></div>`,
    iconSize: [36, 42],
    iconAnchor: [18, 39],
  });
  const marker = L.marker([event.latitude, event.longitude], { icon: markerIcon }).addTo(map);
  const popup = document.createElement("div");
  popup.className = "map-popup";
  const title = createElement("strong", "", event.title);
  const venue = createElement("span", "", event.venue);
  const action = createElement("span", "popup-action", "Vezi evenimentul →");
  popup.append(title, venue, action);
  marker.bindPopup(popup);
  marker.on("click", () => selectEvent(event.id, false));
  return marker;
}

function createEventCard(event) {
  const card = createElement("article", "event-card");
  card.dataset.eventId = event.id;
  if (event.id === selectedEventId) card.classList.add("selected");

  const heading = createElement("div", "event-card-heading");
  const category = createElement("span", `event-category ${getCategoryTagClass(event.category)}`, normalizeCategory(event.category) || event.category);
  const tier = createElement(
    "span",
    `event-tier${event.tier === "paid" ? " promoted" : ""}`,
    event.tier === "paid" ? "Promovat" : "Comunitate",
  );
  heading.append(category, tier);

  const title = createElement("h3", "event-title", event.title);
  const descriptionText = event.isCommunity
    ? `${event.activity || event.description} • Propus de ${event.proposerName || "cineva"}`
    : event.description;
  const description = createElement("p", "event-description", descriptionText);
  const details = createElement("div", "event-details");
  details.append(
    createElement("span", "", `${formatEventDate(event.startsAt)}`),
    createElement("span", "", event.venue),
  );
  if (event.isCommunity && (event.proposerName || event.activity)) {
    const communityMeta = createElement("div", "event-community-meta", `${event.proposerName || "Comunitate"} • ${event.activity || "activitate spontană"}`);
    details.append(communityMeta);
  }

  const actions = createElement("div", "event-actions");
  const voteButton = createElement("button", `vote-button${event.votedByMe ? " voted" : ""}`);
  voteButton.type = "button";
  voteButton.setAttribute("aria-pressed", String(Boolean(event.votedByMe)));
  voteButton.append(
    createElement("span", "vote-symbol", event.votedByMe ? "♥" : "♡"),
    createElement("span", "vote-label", event.votedByMe ? `Ai votat · ${event.votes}` : `Votează · ${event.votes}`),
  );
  voteButton.addEventListener("click", async (clickEvent) => {
    clickEvent.stopPropagation();
    voteButton.disabled = true;
    try {
      const result = await apiRequest(`/api/events/${encodeURIComponent(event.id)}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId }),
      });
      const updated = events.find((item) => item.id === result.eventId);
      if (updated) {
        updated.votes = result.votes;
        updated.votedByMe = result.votedByMe;
      }
      renderEvents();
      setStatus(result.votedByMe ? "Votul tău a fost înregistrat." : "Votul tău a fost retras.", "success");
    } catch (error) {
      voteButton.disabled = false;
      setStatus(error.message, "error");
    }
  });

  const routeButton = createElement("button", "event-route-button", "Cum ajung? ↗");
  routeButton.type = "button";
  routeButton.addEventListener("click", async (clickEvent) => {
    clickEvent.stopPropagation();
    selectEvent(event.id, false);
    await window.FomoRoutePlanner.showRoute(event);
  });
  actions.append(voteButton, routeButton);
  card.append(heading, title, description, details, actions);
  card.addEventListener("click", () => selectEvent(event.id, true));
  return card;
}

function getFilteredEvents() {
  const query = eventSearchQuery.trim().toLowerCase();
  const showPromoted = window.FomoSettings ? window.FomoSettings.showPromoted !== false : true;

  return [...events]
    .filter((event) => !event.isCommunity)
    .filter((event) => {
      if (!showPromoted && event.tier === "paid") return false;

      const eventCategory = normalizeCategory(event.category);
      const matchesCategory = activeCategory === "all" || eventCategory === activeCategory;
      if (!matchesCategory) return false;
      if (!query) return true;

      const searchableText = [
        event.title,
        event.description,
        event.activity,
        event.proposerName,
        eventCategory,
        event.category,
        event.venue,
      ].join(" ").toLowerCase();

      return searchableText.includes(query);
    })
    .sort((left, right) => right.votes - left.votes || left.title.localeCompare(right.title, "ro"));
}

function getCommunityEvents() {
  const query = eventSearchQuery.trim().toLowerCase();

  return [...events]
    .filter((event) => event.isCommunity)
    .filter((event) => {
      if (activeCategory !== "all" && activeCategory !== "Community") {
        return true;
      }
      if (!query) return true;
      const searchableText = [
        event.title,
        event.description,
        event.activity,
        event.proposerName,
        event.venue,
      ].join(" ").toLowerCase();
      return searchableText.includes(query);
    })
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function renderEvents() {
  const filteredEvents = getFilteredEvents();
  const communityEvents = getCommunityEvents();
  const visibleIds = new Set(filteredEvents.map((event) => event.id));

  if (selectedEventId && !visibleIds.has(selectedEventId) && !communityEvents.some((event) => event.id === selectedEventId)) {
    selectedEventId = null;
  }

  eventList.replaceChildren();
  eventCount.textContent = String(filteredEvents.length);

  if (filteredEvents.length === 0) {
    const emptyMessage = eventSearchQuery
      ? `Nu există evenimente care corespund căutării „${eventSearchQuery}”.`
      : "Nu sunt evenimente disponibile pentru filtrul selectat.";
    eventList.append(createElement("p", "loading-events", emptyMessage));
  } else {
    for (const event of filteredEvents) eventList.append(createEventCard(event));
  }

  if (communityList) {
    communityList.replaceChildren();
    if (communityEvents.length === 0) {
      communityList.append(createElement("p", "loading-events", "Nicio sugestie de comunitate nu se potrivește filtrului."));
    } else {
      for (const event of communityEvents) communityList.append(createEventCard(event));
    }
  }

  for (const [id, marker] of eventMarkers) {
    const event = events.find((item) => item.id === id);
    if (!event) continue;

    const isVisible = visibleIds.has(id) || communityEvents.some((item) => item.id === id);
    if (!isVisible) {
      if (map.hasLayer(marker)) map.removeLayer(marker);
      continue;
    }

    if (!map.hasLayer(marker)) map.addLayer(marker);

    marker.setIcon(L.divIcon({
      className: "",
      html: `<div class="event-map-marker-wrap"><div class="event-map-marker${event.isCommunity ? " community" : ""}${event.id === selectedEventId ? " active" : ""}${event.tier === "paid" ? " promoted" : ""}"><span>${event.votes || 0}</span></div></div>`,
      iconSize: [36, 42],
      iconAnchor: [18, 39],
    }));
  }
}

window.renderEvents = renderEvents;

function selectEvent(eventId, openPopup) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return;

  const filteredEvents = getFilteredEvents();
  if (!filteredEvents.some((item) => item.id === eventId)) {
    return;
  }

  selectedEventId = eventId;
  renderEvents();
  const marker = eventMarkers.get(eventId);
  if (marker) {
    map.panTo(marker.getLatLng());
    if (openPopup) marker.openPopup();
  }
  mapHint.textContent = `${event.title} · ${event.venue}`;
}

async function loadEvents() {
  const data = await apiRequest(`/api/events?voterId=${encodeURIComponent(voterId)}`);
  events = data.events;
  for (const marker of eventMarkers.values()) map.removeLayer(marker);
  eventMarkers = new Map(events.map((event) => [event.id, createEventMarker(event)]));
  renderEvents();
  if (events.length) {
    const bounds = L.latLngBounds(events.map((event) => [event.latitude, event.longitude]));
    map.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
  }
}

async function searchPlaces(query) {
  const data = await apiRequest(`/api/search?q=${encodeURIComponent(query)}`);
  return data.results;
}

function hideSuggestions() {
  originSuggestions.hidden = true;
  originSuggestions.replaceChildren();
}

function showSuggestions(results) {
  originSuggestions.replaceChildren();
  for (const result of results) {
    const item = createElement("li");
    const button = createElement("button", "", result.displayName);
    button.type = "button";
    button.setAttribute("role", "option");
    button.addEventListener("click", () => {
      originInput.value = result.displayName;
      originInput.dataset.selectedQuery = result.displayName;
      origin = { latitude: Number(result.latitude), longitude: Number(result.longitude) };
      originHint.textContent = "Punct de plecare selectat";
      hideSuggestions();
      setStatus("Locația de plecare a fost actualizată.", "success");
    });
    item.append(button);
    originSuggestions.append(item);
  }
  originSuggestions.hidden = results.length === 0;
}

originInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = originInput.value.trim();
  if (query !== originInput.dataset.selectedQuery) {
    delete originInput.dataset.selectedQuery;
  }
  const requestId = ++searchRequestId;
  if (query.length < 3) {
    hideSuggestions();
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const results = await searchPlaces(query);
      if (requestId === searchRequestId) showSuggestions(results);
    } catch (error) {
      if (requestId === searchRequestId) {
        hideSuggestions();
        setStatus(error.message, "error");
      }
    }
  }, 700);
});

originInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideSuggestions();
  if (event.key === "Enter" && !originSuggestions.hidden) {
    const firstSuggestion = originSuggestions.querySelector("button");
    if (firstSuggestion) {
      event.preventDefault();
      firstSuggestion.click();
    }
  }
});

document.addEventListener("click", (event) => {
  if (!originSuggestions.parentElement.contains(event.target)) hideSuggestions();
});

locateButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Browserul nu oferă acces la locație. Caută adresa de plecare în câmp.", "error");
    return;
  }
  locateButton.disabled = true;
  setStatus("Se determină locația ta...");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      origin = { latitude: coords.latitude, longitude: coords.longitude };
      originInput.value = "";
      delete originInput.dataset.selectedQuery;
      originHint.textContent = "Folosim locația ta actuală";
      locateButton.disabled = false;
      map.setView([origin.latitude, origin.longitude], 14);
      if (originMarker) map.removeLayer(originMarker);
      originMarker = L.marker([origin.latitude, origin.longitude], {
        icon: L.divIcon({
          className: "",
          html: '<div class="user-map-marker"><span></span></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(map);
      setStatus("Locația ta a fost setată ca punct de plecare.", "success");
    },
    (error) => {
      locateButton.disabled = false;
      const message = error.code === error.PERMISSION_DENIED
        ? "Accesul la locație a fost refuzat. Poți introduce manual adresa."
        : "Nu am putut determina locația. Poți introduce manual adresa.";
      setStatus(message, "error");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
});

function clearRoute() {
  if (routeLayer) map.removeLayer(routeLayer);
  if (originMarker) map.removeLayer(originMarker);
  if (routeDestinationMarker) map.removeLayer(routeDestinationMarker);
  routeLayer = null;
  originMarker = null;
  routeDestinationMarker = null;
}

window.FomoRouteContext = {
  apiRequest,
  clearRoute,
  formatDistance,
  formatDuration,
  map,
  mapHint,
  originHint,
  originInput,
  getOrigin: () => origin,
  getEventMarker: (eventId) => eventMarkers.get(eventId),
  setOrigin: (nextOrigin) => {
    origin = nextOrigin;
  },
  setStatus,
};

categoryFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    categoryFilterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderEvents();
  });
});

eventSearchInput.addEventListener("input", (event) => {
  eventSearchQuery = event.target.value;
  renderEvents();
});

async function initialize() {
  try {
    await apiRequest("/health");
    await loadEvents();
    setStatus("Backend conectat. Votează un plan sau calculează drumul către un eveniment.", "success");
  } catch (error) {
    eventList.replaceChildren(createElement("p", "loading-events", "Nu am putut încărca evenimentele."));
    setStatus(`${error.message} Pornește backendul cu .\\start.ps1.`, "error");
  }
}

initialize();
