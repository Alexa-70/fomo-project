const API_BASE_URL = window.location.origin;
const DEFAULT_ORIGIN = { latitude: 46.7712, longitude: 23.6236 };
const PROFILE_VISITS_KEY = "fomo-place-visits-v1";

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
const recenterButton = document.querySelector("#recenter-button");

/* ==================== HARTĂ LEAFLET ==================== */
const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: true,
  touchZoom: true,
  minZoom: 1,
  maxZoom: 19,
})
  .setView([DEFAULT_ORIGIN.latitude, DEFAULT_ORIGIN.longitude], 13);

L.maplibreGL({
  style: "https://tiles.openfreemap.org/styles/bright",
  attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap',
}).addTo(map);

// 🔥 FIX CRUCIAL: forțează Leaflet să calculeze dimensiunea corect
setTimeout(() => map.invalidateSize(), 100);
window.addEventListener("resize", () => map.invalidateSize());

function updateRecenterButton() {
  if (!userLocation) {
    recenterButton.hidden = true;
    return;
  }

  const locationPoint = map.latLngToContainerPoint([userLocation.latitude, userLocation.longitude]);
  const mapCenter = map.getSize().divideBy(2);
  const zoomedOut = map.getZoom() < userLocationZoom;
  const mapMovedAway = mapCenter.distanceTo(locationPoint) > 48;
  recenterButton.hidden = !zoomedOut && !mapMovedAway;
}

map.on("moveend zoomend", updateRecenterButton);
recenterButton.addEventListener("click", () => {
  if (!userLocation) return;
  map.setView([userLocation.latitude, userLocation.longitude], userLocationZoom);
});

/* ==================== STARE GLOBALĂ ==================== */
let origin = { ...DEFAULT_ORIGIN };
let events = [];
let selectedEventId = null;
let activeCategory = "all";
let eventSearchQuery = "";
let routeLayer = null;
let originMarker = null;
let routeDestinationMarker = null;
let userLocation = null;
let userLocationMarker = null;
let userLocationZoom = null;
let eventMarkers = new Map();
const travelTimeCache = new Map();
const travelTimePending = new Map();
const travelTimeErrors = new Map();
const travelTimeElements = new Map();
const TRAVEL_MODES = [
  { key: "WALKING", icon: "🚶" },
  { key: "TRANSIT", icon: "🚌" },
  { key: "DRIVING", icon: "🚗" },
];
const locationLayer = L.markerClusterGroup({
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  zoomToBoundsOnClick: true,
  maxClusterRadius: 34,
}).addTo(map);
let hasFitLocationBounds = false;
const locationCount = document.querySelector("#map-location-count");
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

function getTravelOrigin() {
  return origin;
}

function getTravelTimeCacheKey(event, start) {
  return [
    start.latitude,
    start.longitude,
    event.latitude,
    event.longitude,
  ].map((coordinate) => Number(coordinate).toFixed(6)).join(":");
}

function formatTravelTimeSummary(travelTimes) {
  return TRAVEL_MODES.map(({ key, icon }) => {
    const seconds = travelTimes[key];
    const duration = Number.isFinite(seconds)
      ? formatDuration(Math.max(60, seconds))
      : "—";
    return `${icon} ${duration}`;
  }).join(" | ");
}

function renderTravelTimeElement(event, element, isPopup = false) {
  const start = getTravelOrigin();
  const cacheKey = getTravelTimeCacheKey(event, start);
  const travelTimes = travelTimeCache.get(cacheKey);
  const error = travelTimeErrors.get(cacheKey) || "";
  element.replaceChildren();
  element.title = error;

  if (!travelTimes) {
    element.textContent = getTravelTimeLabel(event);
    return;
  }

  if (isPopup) {
    element.textContent = formatTravelTimeSummary(travelTimes);
    return;
  }

  for (const { key, icon } of TRAVEL_MODES) {
    const seconds = travelTimes[key];
    const duration = Number.isFinite(seconds)
      ? formatDuration(Math.max(60, seconds))
      : "—";
    const button = createElement("button", "travel-mode-button", `${icon} ${duration}`);
    button.type = "button";
    button.setAttribute("aria-label", `Arată ruta ${key === "WALKING" ? "pe jos" : key === "TRANSIT" ? "cu transportul în comun" : "cu mașina"}`);
    button.title = `Arată ruta: ${button.getAttribute("aria-label").replace("Arată ruta ", "")}`;
    button.addEventListener("click", async (clickEvent) => {
      clickEvent.stopPropagation();
      await window.FomoRoutePlanner.showRoute(event, key);
    });
    element.append(button);
    if (key !== TRAVEL_MODES[TRAVEL_MODES.length - 1].key) {
      element.append(document.createTextNode(" | "));
    }
  }
}

function getTravelTimeLabel(event) {
  const start = getTravelOrigin();
  if (!Number.isFinite(Number(start.latitude)) || !Number.isFinite(Number(start.longitude))) {
    return "Setează o locație pentru estimarea timpilor.";
  }
  const cacheKey = getTravelTimeCacheKey(event, start);
  if (travelTimeCache.has(cacheKey)) {
    return formatTravelTimeSummary(travelTimeCache.get(cacheKey));
  }
  if (travelTimeErrors.has(cacheKey)) {
    return "Timpii de deplasare nu sunt disponibili.";
  }
  return "Se calculează timpii de deplasare...";
}

function registerTravelTimeElement(event, element, isPopup = false) {
  let entry = travelTimeElements.get(event.id);
  if (!entry) {
    entry = { cardElements: new Set(), popupElement: null };
    travelTimeElements.set(event.id, entry);
  }
  if (isPopup) entry.popupElement = element;
  else entry.cardElements.add(element);

  renderTravelTimeElement(event, element, isPopup);
}

function updateTravelTimeElements(event) {
  const entry = travelTimeElements.get(event.id);
  if (!entry) return;
  for (const element of entry.cardElements) {
    renderTravelTimeElement(event, element);
  }
  if (entry.popupElement) {
    renderTravelTimeElement(event, entry.popupElement, true);
  }
}

function requestDistanceMatrix(start, destinations, mode) {
  if (!window.google?.maps?.DistanceMatrixService || !window.google.maps.TravelMode) {
    throw new Error("Serviciul Google Maps Distance Matrix nu este disponibil. Verifică încărcarea SDK-ului și configurarea API-ului.");
  }

  const service = new google.maps.DistanceMatrixService();
  return new Promise((resolve, reject) => {
    service.getDistanceMatrix({
      origins: [{ lat: Number(start.latitude), lng: Number(start.longitude) }],
      destinations: destinations.map((event) => ({
        lat: Number(event.latitude),
        lng: Number(event.longitude),
      })),
      travelMode: google.maps.TravelMode[mode.key],
      unitSystem: google.maps.UnitSystem.METRIC,
    }, (response, status) => {
      if (status !== google.maps.DistanceMatrixStatus.OK) {
        reject(new Error(`Google Maps nu a putut calcula durata ${mode.key}: ${status}.`));
        return;
      }

      const elements = response?.rows?.[0]?.elements;
      if (!Array.isArray(elements) || elements.length !== destinations.length) {
        reject(new Error(`Google Maps a întors un răspuns incomplet pentru modul ${mode.key}.`));
        return;
      }
      resolve(elements.map((element) =>
        element.status === "OK" && Number.isFinite(element.duration?.value)
          ? element.duration.value
          : null
      ));
    });
  });
}

async function calculateTravelTimeBatch(records, start) {
  try {
    const modeResults = await Promise.all(TRAVEL_MODES.map((mode) =>
      requestDistanceMatrix(start, records.map((record) => record.event), mode)
    ));
    records.forEach((record, index) => {
      const times = Object.fromEntries(TRAVEL_MODES.map((mode, modeIndex) => [
        mode.key,
        modeResults[modeIndex][index],
      ]));
      travelTimeCache.set(record.cacheKey, times);
      travelTimeErrors.delete(record.cacheKey);
      travelTimePending.delete(record.cacheKey);
      record.resolve(times);
      updateTravelTimeElements(record.event);
    });
  } catch (error) {
    for (const record of records) {
      travelTimeErrors.set(record.cacheKey, error.message);
      travelTimePending.delete(record.cacheKey);
      record.reject(error);
      updateTravelTimeElements(record.event);
    }
  }
}

function ensureTravelTimes(targetEvents, start) {
  const pendingPromises = [];
  const missingRecords = [];
  for (const event of targetEvents) {
    const cacheKey = getTravelTimeCacheKey(event, start);
    if (travelTimeCache.has(cacheKey)) continue;
    const existingRequest = travelTimePending.get(cacheKey);
    if (existingRequest) {
      pendingPromises.push(existingRequest);
      continue;
    }

    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    travelTimePending.set(cacheKey, promise);
    travelTimeErrors.delete(cacheKey);
    missingRecords.push({ event, cacheKey, resolve, reject });
    pendingPromises.push(promise);
    updateTravelTimeElements(event);
  }

  for (let index = 0; index < missingRecords.length; index += 25) {
    void calculateTravelTimeBatch(missingRecords.slice(index, index + 25), start);
  }
  return Promise.all(pendingPromises);
}

async function refreshTravelTimes(targetEvents = events) {
  const start = getTravelOrigin();
  if (!Number.isFinite(Number(start.latitude)) || !Number.isFinite(Number(start.longitude))) {
    return;
  }
  try {
    await ensureTravelTimes(targetEvents, start);
  } catch (error) {
    setStatus(error.message || "Nu am putut calcula timpii de deplasare.", "error");
  }
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

function isCommunityEvent(event) {
  return Boolean(event.isCommunity) || event.source === "community" || normalizeCategory(event.category) === "Community";
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
  const travelTimes = createElement("span", "map-popup-travel-times");
  registerTravelTimeElement(event, travelTimes, true);
  popup.append(title, venue, travelTimes);
  if (event.description) {
    popup.append(createElement("span", "map-popup-description", event.description));
  }
  popup.append(createElement("span", "popup-action", "Vezi evenimentul →"));
  marker.bindPopup(popup);
  marker.on("click", () => selectEvent(event.id, false));
  return marker;
}

function createLocationPopup(location) {
  const popup = createElement("div", "map-popup");
  popup.append(
    createElement("strong", "", location.name),
    createElement("span", "", location.city),
    createElement("span", "", location.category),
  );
  const upcomingEvents = events
    .filter((event) => event.source === "community" && event.locationId === location.id)
    .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
  for (const event of upcomingEvents) {
    popup.append(
      createElement("strong", "map-popup-event-title", event.title),
      createElement("span", "", formatEventDate(event.startsAt)),
    );
    if (event.description) {
      popup.append(createElement("span", "map-popup-description", event.description));
    }
  }
  if (!upcomingEvents.length) {
    popup.append(createElement("span", "map-popup-description", "Nu există evenimente verificate la această locație."));
  }
  return popup;
}

function setMapLocations(locations) {
  locationLayer.clearLayers();
  const validLocations = locations.filter((location) =>
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude)) &&
    Number(location.latitude) >= -90 &&
    Number(location.latitude) <= 90 &&
    Number(location.longitude) >= -180 &&
    Number(location.longitude) <= 180
  );

  for (const location of validLocations) {
    const marker = L.circleMarker(
      [Number(location.latitude), Number(location.longitude)],
      { radius: 7, className: "location-map-marker", fillColor: "#5cc9dc", fillOpacity: 0.92, color: "#10202b", weight: 2.5 },
    );
    marker.bindPopup(() => createLocationPopup(location));
    marker.bindTooltip(location.name, { direction: "top", offset: [0, -7], sticky: true });
    marker.on("click", () => {
      mapHint.textContent = `${location.name} · ${location.city}`;
    });
    locationLayer.addLayer(marker);
  }

  const cities = new Set(validLocations.map((location) => location.city));
  if (locationCount) {
    locationCount.textContent = `${validLocations.length} locații · ${cities.size} orașe`;
  }
  if (!hasFitLocationBounds && validLocations.length) {
    hasFitLocationBounds = true;
    map.fitBounds(
      L.latLngBounds(validLocations.map((location) => [Number(location.latitude), Number(location.longitude)])).pad(0.08),
      { maxZoom: 7 },
    );
  }
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
  const communityEvent = isCommunityEvent(event);
  const descriptionText = communityEvent
    ? `${event.activity || event.description} • Propus de ${event.proposerName || "cineva"}`
    : event.description;
  const description = createElement("p", "event-description", descriptionText);
  const details = createElement("div", "event-details");
  details.append(
    createElement("span", "", `${formatEventDate(event.startsAt)}`),
    createElement("span", "", event.venue),
  );
  const travelTimes = createElement("div", "event-travel-times");
  registerTravelTimeElement(event, travelTimes);
  details.append(travelTimes);
  if (communityEvent && (event.proposerName || event.activity)) {
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

  const routeButton = createElement("button", "event-route-button", "Arată rută ↗");
  routeButton.type = "button";
  routeButton.addEventListener("click", async (clickEvent) => {
    clickEvent.stopPropagation();
    document.querySelectorAll(".event-route-button, .travel-mode-button").forEach((button) => {
      button.disabled = true;
    });
    selectEvent(event.id, false);
    await window.FomoRoutePlanner.showRoute(event, "WALKING");
  });
  if (event.source !== "community") actions.append(voteButton);
  actions.append(routeButton);
  card.append(heading, title, description, details, actions);
  card.addEventListener("click", async () => {
    selectEvent(event.id, true);
    await window.FomoRoutePlanner.showRoute(event, "WALKING");
  });
  return card;
}

function getFilteredEvents() {
  const query = eventSearchQuery.trim().toLowerCase();
  const showPromoted = window.FomoSettings ? window.FomoSettings.showPromoted !== false : true;

  return [...events]
    .filter((event) => !isCommunityEvent(event))
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
    .filter(isCommunityEvent)
    .filter((event) => {
      if (activeCategory !== "all" && activeCategory !== "Community") {
        if (normalizeCategory(event.category) !== activeCategory) return false;
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
  for (const entry of travelTimeElements.values()) {
    entry.cardElements.clear();
  }

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
      html: `<div class="event-map-marker-wrap"><div class="event-map-marker${isCommunityEvent(event) ? " community" : ""}${event.id === selectedEventId ? " active" : ""}${event.tier === "paid" ? " promoted" : ""}"><span>${event.votes || 0}</span></div></div>`,
      iconSize: [36, 42],
      iconAnchor: [18, 39],
    }));
  }
}

window.renderEvents = renderEvents;

function selectEvent(eventId, openPopup) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return;

  const isVisible = getFilteredEvents().some((item) => item.id === eventId)
    || getCommunityEvents().some((item) => item.id === eventId);
  if (!isVisible) {
    return;
  }

  selectedEventId = eventId;
  if (openPopup) recordPlaceVisit(event);
  renderEvents();
  const marker = eventMarkers.get(eventId);
  if (marker) {
    map.panTo(marker.getLatLng());
    if (openPopup) marker.openPopup();
  }
  mapHint.textContent = `${event.title} · ${event.venue}`;
}

function recordPlaceVisit(event) {
  try {
    const storedVisits = localStorage.getItem(PROFILE_VISITS_KEY);
    const visits = storedVisits ? JSON.parse(storedVisits) : [];
    if (!Array.isArray(visits)) throw new Error("Stored place visits are not a list.");
    const venue = String(event.venue || "").trim();
    if (!venue) return;

    const existingVisit = visits.find((visit) => visit.venue === venue);
    if (existingVisit) {
      existingVisit.count += 1;
      existingVisit.eventTitle = event.title;
      existingVisit.lastVisited = new Date().toISOString();
    } else {
      visits.push({
        venue,
        eventTitle: event.title,
        count: 1,
        lastVisited: new Date().toISOString(),
      });
    }
    localStorage.setItem(PROFILE_VISITS_KEY, JSON.stringify(visits));
  } catch (error) {
    console.error("Could not save local place visits.", error);
    setStatus("Nu am putut salva activitatea profilului în acest browser.", "error");
  }
}

window.FomoSearch = {
  search(query, category = "all") {
    const normalizedQuery = query.trim().toLocaleLowerCase("ro");
    return events.filter((event) =>
      (category === "all" || matchesEventCategory(event.category, category)) &&
      (!normalizedQuery || [event.title, event.venue, event.category, event.description]
        .some((value) => String(value || "").toLocaleLowerCase("ro").includes(normalizedQuery)))
    );
  },
  select(eventId) {
    selectEvent(eventId, true);
  },
};

function matchesEventCategory(category, filter) {
  const normalizedCategory = String(category || "").toLocaleLowerCase("ro");
  const categoryTerms = {
    restaurants: ["food", "drink", "restaurant", "culinar", "gastronom"],
    music: ["muzic", "music", "concert", "dj"],
    meetups: ["social", "întâln", "intaln", "meetup", "network"],
    outdoor: ["outdoor", "alerg", "sport", "drume", "natur"],
    film: ["film", "cinema", "proiec"],
  };
  if (filter === "other") {
    return !Object.values(categoryTerms).some((terms) =>
      terms.some((term) => normalizedCategory.includes(term))
    );
  }
  return (categoryTerms[filter] || []).some((term) => normalizedCategory.includes(term));
}

async function loadEvents() {
  const data = await apiRequest(`/api/events?voterId=${encodeURIComponent(voterId)}`);
  const communityEvents = events.filter((event) => event.source === "community");
  events = data.events.concat(communityEvents);
  for (const marker of eventMarkers.values()) map.removeLayer(marker);
  eventMarkers = new Map(events.map((event) => [event.id, createEventMarker(event)]));
  renderEvents();
  void refreshTravelTimes();
  if (events.length && !userLocation) {
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
      refreshTravelTimes();
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

function locateUser(isAutomatic = false) {
  if (!navigator.geolocation) {
    setStatus("Browserul nu oferă acces la locație. Caută adresa de plecare în câmp.", "error");
    return;
  }
  if (!isAutomatic) locateButton.disabled = true;
  setStatus("Se determină locația ta...");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      origin = { latitude: coords.latitude, longitude: coords.longitude };
      userLocation = { ...origin };
      originInput.value = "";
      delete originInput.dataset.selectedQuery;
      originHint.textContent = "Folosim locația ta actuală";
      locateButton.disabled = false;
      map.setView([origin.latitude, origin.longitude], 14);
      userLocationZoom = map.getZoom();
      const userLocationIcon = L.divIcon({
        className: "",
        html: '<div class="user-map-marker"><span></span></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      if (userLocationMarker) {
        userLocationMarker.setLatLng([userLocation.latitude, userLocation.longitude]);
      } else {
        userLocationMarker = L.marker([userLocation.latitude, userLocation.longitude], {
          icon: userLocationIcon,
          zIndexOffset: 1000,
          interactive: false,
        }).addTo(map);
      }
      updateRecenterButton();
      setStatus("Locația ta a fost setată ca punct de plecare.", "success");
      void refreshTravelTimes();
    },
    (error) => {
      locateButton.disabled = false;
      const message = error.code === error.PERMISSION_DENIED
        ? "Accesul la locație a fost refuzat. Permite locația în browser sau introdu manual adresa."
        : "Nu am putut determina locația. Verifică setările browserului sau introdu manual adresa.";
      setStatus(message, "error");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

locateButton.addEventListener("click", () => locateUser());

function clearRoute() {
  if (routeLayer) map.removeLayer(routeLayer);
  if (routeDestinationMarker) map.removeLayer(routeDestinationMarker);
  routeLayer = null;
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
    void refreshTravelTimes();
  },
  setStatus,
};

window.FomoTravelTimes = {
  forEvent: async (event, start = getTravelOrigin()) => {
    const cacheKey = getTravelTimeCacheKey(event, start);
    if (travelTimeCache.has(cacheKey)) return travelTimeCache.get(cacheKey);
    await ensureTravelTimes([event], start);
    return travelTimeCache.get(cacheKey);
  },
  refresh: refreshTravelTimes,
  format: formatTravelTimeSummary,
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

window.FomoRefreshCommunityEvents = (communityEvents) => {
  events = events.filter((event) => event.source !== "community").concat(communityEvents);
  for (const marker of eventMarkers.values()) map.removeLayer(marker);
  eventMarkers = new Map(events.map((event) => [event.id, createEventMarker(event)]));
  renderEvents();
  void refreshTravelTimes();
};

window.FomoSetLocations = setMapLocations;

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
locateUser(true);
