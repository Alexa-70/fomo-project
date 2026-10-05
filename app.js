const DEFAULT_ORIGIN = { latitude: 46.7712, longitude: 23.6236 };
const PROFILE_VISITS_KEY = "fomo-place-visits-v1";

function getApiBaseUrl() {
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const isLocalFrontend = window.location.protocol === "file:" ||
    (localHosts.has(window.location.hostname) && window.location.port !== "5101");
  return isLocalFrontend ? "http://localhost:5101" : "";
}

const API_BASE_URL = getApiBaseUrl();

const originInput = document.querySelector("#origin");
const originSuggestions = document.querySelector("#origin-suggestions");
const originHint = document.querySelector("#origin-hint");
const locateButton = document.querySelector("#locate-button");
const eventList = document.querySelector("#event-list");
const eventCount = document.querySelector("#event-count");
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

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
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
let eventFilters = { category: "all", venueType: "all", sort: "popular" };
let showPromotedEvents = true;
let mapLocationsById = new Map();
let selectedEventId = null;
let routeLayer = null;
let originMarker = null;
let routeDestinationMarker = null;
let userLocation = null;
let userLocationMarker = null;
let userLocationZoom = null;
let eventMarkers = new Map();
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

async function apiRequest(path, options = {}) {
  const apiUrl = `${API_BASE_URL}${path}`;
  let response;
  try {
    response = await fetch(apiUrl, options);
  } catch (error) {
    if (error instanceof TypeError) {
      const backendUrl = API_BASE_URL || window.location.origin;
      throw new Error(`Nu mă pot conecta la backendul FOMO (${backendUrl}). Pornește backendul cu .\\start.ps1 și reîncarcă pagina.`);
    }
    throw error;
  }
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

function formatEventTimeRange(event) {
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt || new Date(startsAt.getTime() + 2 * 60 * 60 * 1000));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return "Oră nespecificată";
  const today = new Date();
  const isToday = startsAt.getFullYear() === today.getFullYear() &&
    startsAt.getMonth() === today.getMonth() &&
    startsAt.getDate() === today.getDate();
  const day = isToday
    ? "Astăzi"
    : new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long" }).format(startsAt);
  const timeOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  const startTime = new Intl.DateTimeFormat("ro-RO", timeOptions).format(startsAt);
  const endTime = new Intl.DateTimeFormat("ro-RO", timeOptions).format(endsAt);
  return `${day} · ${startTime}–${endTime}`;
}

function eventHasEnded(event, now = Date.now()) {
  const endsAt = new Date(event.endsAt || "");
  if (Number.isFinite(endsAt.getTime())) return endsAt.getTime() <= now;
  const startsAt = new Date(event.startsAt || "");
  return Number.isFinite(startsAt.getTime()) &&
    startsAt.getTime() + 2 * 60 * 60 * 1000 <= now;
}

function formatTicketPrice(event) {
  if (!Number.isSafeInteger(event.ticketPriceCents)) return "Preț nespecificat";
  return event.ticketPriceCents === 0
    ? "Intrare gratuită"
    : `${(event.ticketPriceCents / 100).toFixed(2)} RON`;
}

function createTicketLink(event) {
  if (typeof event.ticketUrl !== "string") return null;
  try {
    const url = new URL(event.ticketUrl);
    if (url.protocol !== "https:") return null;
    const link = createElement("a", "event-ticket-link", "Cumpără bilet ↗");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  } catch (error) {
    console.error("Ignoring invalid event ticket URL.", error);
    return null;
  }
}

function eventCategoryLabel(category) {
  return ({
    socializing: "Socializare",
    workshops: "Ateliere",
    charity: "Caritate",
    exhibitions: "Expoziții și artă",
    sports: "Sport",
    healthcare: "Sănătate și wellbeing",
    entertainment: "Muzică și divertisment",
  })[category] || category;
}

function attendanceCountLabel(event) {
  if (event.attendanceError) return "—";
  if (event.attendanceLoaded !== true || !Number.isSafeInteger(event.attendeesCount)) return "…";
  return String(event.attendeesCount);
}

function createAttendanceButton(event) {
  const count = attendanceCountLabel(event);
  const countUnavailable = count === "…" || count === "—";
  const button = createElement(
    "button",
    `event-attendance-button${event.goingByMe ? " attending" : ""}${countUnavailable ? " attendance-loading" : ""}`,
    `${event.goingByMe ? "Merg" : "Voi merge"} · ${count}`,
  );
  button.type = "button";
  button.disabled = countUnavailable;
  button.title = count === "…"
    ? "Se încarcă numărul real de participanți."
    : count === "—"
      ? `Numărul real de participanți nu este disponibil${event.attendanceError ? `: ${event.attendanceError}` : "."}`
      : `${count} persoane au confirmat participarea.`;
  button.setAttribute("aria-pressed", String(Boolean(event.goingByMe)));
  button.setAttribute("aria-label", countUnavailable
    ? `Voi merge; numărul real de participanți ${count === "…" ? "se încarcă" : "nu este disponibil"}`
    : `${event.goingByMe ? "Merg" : "Voi merge"}; ${count} persoane au confirmat`);
  if (countUnavailable) return button;
  button.addEventListener("click", async (clickEvent) => {
    clickEvent.stopPropagation();
    const api = window.FomoFirebase;
    const user = api?.user();
    if (!api?.configured || !user?.emailVerified) {
      setStatus("Autentifică-te și confirmă emailul pentru a confirma participarea.", "error");
      return;
    }
    button.disabled = true;
    const attendanceRef = api.db.ref(`eventAttendance/${event.databaseEventId || event.id}/${user.uid}`);
    try {
      if (event.goingByMe) await attendanceRef.remove();
      else await attendanceRef.set(firebase.database.ServerValue.TIMESTAMP);
    } catch (error) {
      setStatus(`Nu am putut actualiza participarea: ${error.message}`, "error");
      button.disabled = false;
    }
  });
  return button;
}

function createEventTravelActions(event, onRoute) {
  const routeButton = createElement("button", "event-route-button", "Cum ajung? ↗");
  routeButton.type = "button";
  routeButton.addEventListener("click", async (clickEvent) => {
    clickEvent.stopPropagation();
    onRoute?.();
    await window.FomoRoutePlanner.showRoute(event);
  });

  const transitButton = createElement("button", "event-route-button transit-route-button", "Transport public ↗");
  transitButton.type = "button";
  transitButton.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    onRoute?.();
    window.FomoRoutePlanner.showRoute(event, "TRANSIT");
  });

  const rideActions = window.FomoRideSharing.createActions(event);
  rideActions.addEventListener("click", (clickEvent) => clickEvent.stopPropagation());
  return [routeButton, transitButton, rideActions];
}

/* ==================== MARKERE ==================== */
function createEventMarker(event) {
  const markerCount = event.source === "community"
    ? attendanceCountLabel(event)
    : String(event.votes);
  const markerIcon = L.divIcon({
    className: "",
    html: `<div class="event-map-marker-wrap"><div class="event-map-marker${event.tier === "paid" ? " promoted" : ""}"><span>${markerCount}</span></div></div>`,
    iconSize: [36, 42],
    iconAnchor: [18, 39],
  });
  const marker = L.marker([event.latitude, event.longitude], { icon: markerIcon }).addTo(map);
  const popup = document.createElement("div");
  popup.className = "map-popup";
  const title = createElement("strong", "", event.title);
  const venue = createElement("span", "", event.venue);
  popup.append(title, venue);
  popup.append(createElement(
    "span",
    "map-popup-description",
    `${formatEventTimeRange(event)} · Bilet: ${formatTicketPrice(event)}`,
  ));
  popup.append(createAttendanceButton(event));
  const ticketLink = createTicketLink(event);
  if (ticketLink) popup.append(ticketLink);
  if (event.status === "pending") {
    popup.append(createElement("span", "map-popup-description", "În verificare de către owner sau admin."));
  }
  if (event.description) {
    popup.append(createElement("span", "map-popup-description", event.description));
  }
  const viewButton = createElement("button", "event-route-button popup-action", "Vezi evenimentul →");
  viewButton.type = "button";
  viewButton.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    window.dispatchEvent(new CustomEvent("fomo-view-event", { detail: { eventId: event.id } }));
  });
  popup.append(viewButton, ...createEventTravelActions(event, () => selectEvent(event.id, false)));
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
    .filter((event) => event.source === "community" && event.locationId === location.id && !eventHasEnded(event))
    .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
  for (const event of upcomingEvents) {
    popup.append(
      createElement("strong", "map-popup-event-title", event.title),
      createElement("span", "", formatEventTimeRange(event)),
      createElement("span", "", `Bilet: ${formatTicketPrice(event)}`),
      createElement("span", "", event.attendanceLoaded
        ? `${attendanceCountLabel(event)} persoane merg`
        : event.attendanceError
          ? "Numărul real de participanți nu este disponibil."
          : "Se încarcă numărul real de participanți…"),
      createElement("span", "", event.status === "pending" ? "În verificare" : "Verificat"),
    );
    if (event.description) {
      popup.append(createElement("span", "map-popup-description", event.description));
    }
    popup.append(createAttendanceButton(event));
    const ticketLink = createTicketLink(event);
    if (ticketLink) popup.append(ticketLink);
  }
  if (!upcomingEvents.length) {
    popup.append(createElement("span", "map-popup-description", "Nu există evenimente trimise la această locație."));
  }
  const routeDestination = {
    id: location.id,
    title: location.name,
    venue: location.city,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  };
  popup.append(...createEventTravelActions(routeDestination));
  return popup;
}

function createLocationTooltip(location) {
  const tooltip = createElement("div", "location-tooltip");
  const imageUrl = typeof location.imageUrl === "string" ? location.imageUrl.trim() : "";

  if (imageUrl) {
    try {
      const parsedImageUrl = new URL(imageUrl);
      if (parsedImageUrl.protocol === "https:") {
        const image = document.createElement("img");
        image.src = parsedImageUrl.href;
        image.alt = `Fotografie: ${location.name}`;
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.remove(), { once: true });
        tooltip.append(image);
      }
    } catch (error) {
      console.warn(`Adresa imaginii pentru locația "${location.name}" nu este validă.`, error);
    }
  }

  tooltip.append(
    createElement("strong", "", location.name),
    createElement("span", "", `${location.city} · ${location.category}`),
  );
  return tooltip;
}

function getLocationCategoryIcon(category) {
  const normalizedCategory = String(category || "").trim().toLocaleLowerCase("ro");
  if (normalizedCategory.includes("restaurant")) {
    return '<g class="location-map-pin-category" transform="translate(0 5)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M16 14v9M16 14V7M13 7v5a3 3 0 0 0 6 0V7M24 7v16M24 7c3 2 3 7 0 9"/></g>';
  }
  if (normalizedCategory.includes("bar") || normalizedCategory.includes("pub")) {
    return '<g class="location-map-pin-category" transform="translate(0 3)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 8h16l-6 8v7h-4v-7zM20 23v3M15 26h10"/><path d="M20 8v4"/></g>';
  }
  if (normalizedCategory.includes("cafenea") || normalizedCategory.includes("cafe")) {
    return '<g class="location-map-pin-category" transform="translate(0 5)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M13 11h13v8a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5zM26 13h2a3 3 0 0 1 0 6h-2M17 7c-2-2 2-2 0-4M22 7c-2-2 2-2 0-4"/></g>';
  }
  if (normalizedCategory.includes("club") || normalizedCategory.includes("muz")) {
    return '<g class="location-map-pin-category" transform="translate(-6 5)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M22 7v14.5a3.5 3.5 0 1 1-2-3.16V11l9-2v10.5a3.5 3.5 0 1 1-2-3.16V7z"/></g>';
  }
  if (normalizedCategory.includes("outdoor") || normalizedCategory.includes("parc")) {
    return '<g class="location-map-pin-category" transform="translate(0 3)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m20 6 9 10h-6l6 7H11l6-7h-6zM20 23v4"/></g>';
  }
  if (normalizedCategory.includes("cultur") || normalizedCategory.includes("teatru") || normalizedCategory.includes("muze")) {
    return '<g class="location-map-pin-category" transform="translate(0 4)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 12c0-3 4-5 8-5s8 2 8 5-4 5-8 5-8-2-8-5zM12 12v8c0 3 4 5 8 5s8-2 8-5v-8M16 12h.01M24 12h.01M18 22l2-2 2 2"/></g>';
  }
  return '<g class="location-map-pin-category location-map-pin-category-default" transform="translate(0 3)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="20" cy="17" r="7"/><path d="m20 10 1.5 5.5L27 17l-5.5 1.5L20 24l-1.5-5.5L13 17l5.5-1.5z"/></g>';
}

function setMapLocations(locations) {
  mapLocationsById = new Map(locations.map((location) => [location.id, location]));
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
    const locationIcon = L.divIcon({
      className: "location-map-pin",
      html: `<svg aria-hidden="true" viewBox="0 0 40 52" focusable="false"><path class="location-map-pin-shape" d="M20 1C9.5 1 1 9.5 1 20c0 12.2 15.8 29.5 18.1 31.5a1.35 1.35 0 0 0 1.8 0C23.2 49.5 39 32.2 39 20 39 9.5 30.5 1 20 1Z"/>${getLocationCategoryIcon(location.category)}</svg>`,
      iconSize: [40, 52],
      iconAnchor: [20, 51],
      popupAnchor: [0, -48],
      tooltipAnchor: [0, -45],
    });
    const marker = L.marker(
      [Number(location.latitude), Number(location.longitude)],
      { icon: locationIcon, title: `${location.name} · ${location.category}`, alt: `${location.name}, ${location.city}, ${location.category}` },
    );
    marker.bindPopup(() => createLocationPopup(location));
    marker.bindTooltip(() => createLocationTooltip(location), {
      direction: "top",
      offset: [0, -7],
      sticky: true,
      opacity: 1,
      className: "location-map-tooltip",
    });
    marker.on("popupopen", () => {
      map.getContainer().classList.add("location-popup-open");
      marker.closeTooltip();
    });
    marker.on("popupclose", () => {
      map.getContainer().classList.remove("location-popup-open");
    });
    marker.on("click", () => {
      marker.closeTooltip();
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
  const category = createElement("span", "event-category", eventCategoryLabel(event.category));
  const tierClass = event.tier === "paid" ? "promoted"
    : event.status === "pending" ? "unverified"
      : "";
  const tier = createElement(
    "span",
    `event-tier${tierClass ? ` ${tierClass}` : ""}`,
    event.tier === "paid" ? "Promovat" : event.status === "pending" ? "În verificare" : "Comunitate",
  );
  heading.append(category, tier);

  const title = createElement("h3", "event-title", event.title);
  const description = createElement("p", "event-description", event.description);
  const details = createElement("div", "event-details");
  details.append(
    createElement("span", "", formatEventTimeRange(event)),
    createElement("span", "", event.venue),
    createElement("span", "", `Bilet: ${formatTicketPrice(event)}`),
  );

  const actions = createElement("div", "event-actions");
  actions.append(createAttendanceButton(event));
  const ticketLink = createTicketLink(event);
  if (ticketLink) actions.append(ticketLink);
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

  const travelActions = createEventTravelActions(event, () => selectEvent(event.id, false));
  if (event.source !== "community") actions.append(voteButton);
  actions.append(...travelActions);
  card.append(heading, title, description, details, actions);
  card.addEventListener("click", () => selectEvent(event.id, true));
  return card;
}

function renderEvents() {
  const visibleEvents = getFilteredEvents(events);
  eventList.replaceChildren();
  eventCount.textContent = String(visibleEvents.length);
  for (const [id, marker] of eventMarkers) {
    const event = events.find((item) => item.id === id);
    if (!event) continue;
    if (visibleEvents.includes(event)) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else if (map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  }
  if (visibleEvents.length === 0) {
    eventList.append(createElement("p", "loading-events", "Nu există evenimente pentru filtrele alese."));
    return;
  }
  for (const event of visibleEvents) eventList.append(createEventCard(event));

  for (const [id, marker] of eventMarkers) {
    const event = events.find((item) => item.id === id);
    if (!event) continue;
    marker.setIcon(L.divIcon({
      className: "",
      html: `<div class="event-map-marker-wrap"><div class="event-map-marker${event.id === selectedEventId ? " active" : ""}${event.tier === "paid" ? " promoted" : ""}"><span>${event.source === "community" ? attendanceCountLabel(event) : "…"}</span></div></div>`,
      iconSize: [36, 42],
      iconAnchor: [18, 39],
    }));
  }
}

function pruneExpiredEvents() {
  const activeEvents = events.filter((event) => !eventHasEnded(event));
  if (activeEvents.length === events.length) return;
  const activeIds = new Set(activeEvents.map((event) => event.id));
  for (const [id, marker] of eventMarkers) {
    if (activeIds.has(id)) continue;
    if (map.hasLayer(marker)) map.removeLayer(marker);
    eventMarkers.delete(id);
    if (selectedEventId === id) selectedEventId = null;
  }
  map.closePopup();
  events = activeEvents;
  renderEvents();
}

function selectEvent(eventId, openPopup) {
  selectedEventId = eventId;
  const event = events.find((item) => item.id === eventId);
  if (!event) return;
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
    const filtered = getFilteredEvents(events, { ...eventFilters, category })
      .filter((event) => !normalizedQuery || [event.title, event.venue, event.category, event.description]
        .some((value) => String(value || "").toLocaleLowerCase("ro").includes(normalizedQuery)));
    return filtered;
  },
  select(eventId) {
    selectEvent(eventId, true);
  },
};

function getFilteredEvents(sourceEvents, filters = eventFilters) {
  const filtered = sourceEvents.filter((event) =>
    !eventHasEnded(event) &&
    (showPromotedEvents || event.tier !== "paid") &&
    (filters.category === "all" || matchesEventCategory(event.category, filters.category)) &&
    (filters.venueType === "all" ||
      String(event.venueType || mapLocationsById.get(event.locationId)?.category || "").toLocaleLowerCase("ro") === filters.venueType)
  );
  const sorters = {
    popular: (left, right) => Number(right.attendeesCount || 0) - Number(left.attendeesCount || 0),
    soonest: (left, right) => new Date(left.startsAt) - new Date(right.startsAt),
    cheapest: (left, right) => Number(left.ticketPriceCents || 0) - Number(right.ticketPriceCents || 0),
  };
  filtered.sort((sorters[filters.sort] || sorters.popular) ||
    ((left, right) => left.title.localeCompare(right.title, "ro")));
  return filtered;
}

function matchesEventCategory(category, filter) {
  const normalizedCategory = String(category || "").toLocaleLowerCase("ro");
  const categoryTerms = {
    socializing: ["social", "socializare", "întâln", "intaln", "meetup", "network"],
    workshops: ["atelier", "workshop", "curs", "training"],
    charity: ["caritate", "charity", "voluntar", "fundraising"],
    exhibitions: ["expozi", "exhibi", "artă", "arta", "pictur", "painting", "galerie"],
    sports: ["sport", "alerg", "drume", "fitness", "yoga"],
    healthcare: ["sănăt", "sanat", "health", "wellbeing", "medical"],
    entertainment: ["entertainment", "divertisment", "muzic", "music", "concert", "dj", "film", "cinema", "food", "drink", "restaurant"],
  };
  return (categoryTerms[filter] || []).some((term) => normalizedCategory.includes(term));
}

window.FomoSetEventFilters = (filters) => {
  eventFilters = { ...eventFilters, ...filters };
  renderEvents();
};

window.FomoSetPromotedVisibility = (showPromoted) => {
  showPromotedEvents = showPromoted;
  renderEvents();
};

window.FomoSetEventLocations = (locations) => {
  setMapLocations(locations);
  const venueSelect = document.querySelector("#venue-type-select");
  if (!venueSelect) return;
  const selectedValue = venueSelect.value;
  const venueTypes = [...new Set(locations
    .map((location) => String(location.category || "").trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right, "ro"));
  venueSelect.replaceChildren(createElement("option", "", "Toate locațiile"));
  venueSelect.options[0].value = "all";
  venueTypes.forEach((venueType) => {
    const option = createElement("option", "", venueType);
    option.value = venueType.toLocaleLowerCase("ro");
    venueSelect.append(option);
  });
  if ([...venueSelect.options].some((option) => option.value === selectedValue)) {
    venueSelect.value = selectedValue;
  }
};

async function loadEvents() {
  const data = await apiRequest(`/api/events?voterId=${encodeURIComponent(voterId)}`);
  const communityEvents = events.filter((event) => event.source === "community");
  events = data.events.concat(communityEvents).filter((event) => !eventHasEnded(event));
  for (const marker of eventMarkers.values()) map.removeLayer(marker);
  eventMarkers = new Map(events.map((event) => [event.id, createEventMarker(event)]));
  renderEvents();
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
  originInput,
  originHint,
  getOrigin: () => ({ ...origin }),
  getEventMarker: (eventId) => eventMarkers.get(eventId),
  setOrigin: (nextOrigin) => {
    origin = nextOrigin;
  },
  setStatus,
};

window.FomoRefreshCommunityEvents = (communityEvents) => {
  events = events.filter((event) => event.source !== "community")
    .concat(communityEvents.filter((event) => !eventHasEnded(event)));
  for (const marker of eventMarkers.values()) map.removeLayer(marker);
  eventMarkers = new Map(events.map((event) => [event.id, createEventMarker(event)]));
  renderEvents();
};

window.FomoSetLocations = setMapLocations;
window.setInterval(pruneExpiredEvents, 30_000);

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
