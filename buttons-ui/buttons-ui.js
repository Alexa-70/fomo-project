(function () {
  const homeButton = document.querySelector("#home-button");
  const featuresButton = document.querySelector("#features-button");
  const friendsButton = document.querySelector("#friends-button");
  const searchButton = document.querySelector("#search-button");
  const profileButton = document.querySelector("#profile-button");
  const floatingPanel = document.querySelector("#floating-panel");
  const friendsPanel = document.querySelector("#friends-panel");
  const friendsFindButton = document.querySelector("#friends-find-button");
  const friendsSearchForm = document.querySelector("#friends-search-form");
  const friendsSearchInput = document.querySelector("#friends-search-input");
  const friendsStatus = document.querySelector("#friends-status");
  const friendsList = document.querySelector("#friends-list");
  const friendsCount = document.querySelector("#friends-count");
  const searchPanel = document.querySelector("#search-panel");
  const profilePanel = document.querySelector("#profile-panel");
  const profileCloseButton = document.querySelector("#profile-close-button");
  const friendsCloseButton = document.querySelector("#friends-close-button");
  const searchCloseButton = document.querySelector("#search-close-button");
  const searchInput = document.querySelector("#event-search-input");
  const searchFilters = document.querySelector("#search-filters");
  const searchResults = document.querySelector("#search-results");
  const searchResultsStatus = document.querySelector("#search-results-status");
  const profileUsername = document.querySelector("#profile-username");
  const profileNameEditor = document.querySelector("#profile-name-editor");
  const profileNameInput = document.querySelector("#profile-name-input");
  const profileBadges = document.querySelector("#profile-badges");
  const profilePlacesList = document.querySelector("#profile-places-list");
  const mapHint = document.querySelector("#map-hint");
  const profileNameKey = "fomo-profile-name-v1";
  const profileVisitsKey = "fomo-place-visits-v1";
  const friendsStorageKey = "fomo-local-friends-v1";
  let activeSearchCategory = "all";

  function setNavigationView(view) {
    const featuresOpen = view === "features";
    const friendsOpen = view === "friends";
    const searchOpen = view === "search";
    const profileOpen = view === "profile";

    floatingPanel.classList.toggle("is-open", featuresOpen);
    friendsPanel.hidden = !friendsOpen;
    searchPanel.hidden = !searchOpen;
    profilePanel.hidden = !profileOpen;
    featuresButton.classList.toggle("active", featuresOpen);
    friendsButton.classList.toggle("active", friendsOpen);
    searchButton.classList.toggle("active", searchOpen);
    profileButton.classList.toggle("active", profileOpen);
    homeButton.classList.toggle("active", view === "home");
    featuresButton.setAttribute("aria-expanded", String(featuresOpen));
    friendsButton.setAttribute("aria-expanded", String(friendsOpen));
    searchButton.setAttribute("aria-expanded", String(searchOpen));
    profileButton.setAttribute("aria-expanded", String(profileOpen));
    [homeButton, featuresButton, friendsButton, searchButton, profileButton].forEach((button) => button.removeAttribute("aria-current"));
    const currentButton = view === "home" ? homeButton
      : featuresOpen ? featuresButton
        : friendsOpen ? friendsButton
          : searchOpen ? searchButton
        : profileOpen ? profileButton
          : null;
    if (currentButton) currentButton.setAttribute("aria-current", "page");
    mapHint.style.display = view === "home" ? "" : "none";
    document.body.dataset.navigationView = view;
    if (view === "home" && window.FomoRouteContext) {
      window.setTimeout(() => window.FomoRouteContext.map.invalidateSize(), 50);
    }
  }

  function renderSearchResults() {
    searchResults.replaceChildren();
    if (!searchInput.value.trim() && activeSearchCategory === "all") {
      searchResultsStatus.textContent = "Scrie pentru a căuta evenimente.";
      return;
    }

    const matches = window.FomoSearch.search(searchInput.value, activeSearchCategory);
    if (!matches.length) {
      searchResultsStatus.textContent = "Nu am găsit evenimente pentru filtrul selectat.";
      return;
    }

    searchResultsStatus.textContent = `${matches.length} ${matches.length === 1 ? "rezultat" : "rezultate"}`;
    matches.forEach((event) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = "search-result-button";
      button.type = "button";
      const title = document.createElement("span");
      title.className = "search-result-title";
      title.textContent = event.title;
      const details = document.createElement("span");
      details.className = "search-result-details";
      details.textContent = `${event.venue} · ${event.category}`;
      button.append(title, details);
      button.addEventListener("click", () => {
        window.FomoSearch.select(event.id);
        searchInput.value = "";
        activeSearchCategory = "all";
        searchFilters.querySelectorAll(".search-filter").forEach((filterButton) => {
          const isActive = filterButton.dataset.category === activeSearchCategory;
          filterButton.classList.toggle("active", isActive);
          filterButton.setAttribute("aria-pressed", String(isActive));
        });
        renderSearchResults();
        setNavigationView("home");
      });
      item.append(button);
      searchResults.append(item);
    });
  }

  function readStoredValue(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (error) {
      console.error(`Could not read local profile data for "${key}".`, error);
      return "Indisponibil";
    }
  }

  function loadFriends() {
    let storedFriends;
    try {
      storedFriends = localStorage.getItem(friendsStorageKey);
    } catch (error) {
      console.error("Could not read the local friends list.", error);
      friendsStatus.textContent = "Nu am putut accesa lista salvată în acest browser.";
      return [];
    }

    if (!storedFriends) return [];
    try {
      const friends = JSON.parse(storedFriends);
      if (!Array.isArray(friends) || friends.some((friend) => typeof friend !== "string")) {
        throw new Error("Stored friends are not a list of names.");
      }
      return friends;
    } catch (error) {
      console.error("Could not parse the local friends list.", error);
      friendsStatus.textContent = "Lista salvată nu poate fi citită.";
      return [];
    }
  }

  function renderFriends(query = "") {
    const friends = loadFriends();
    const normalizedQuery = query.trim().toLocaleLowerCase("ro");
    const visibleFriends = friends.filter((friend) => friend.toLocaleLowerCase("ro").includes(normalizedQuery));
    friendsCount.textContent = String(friends.length);
    friendsList.replaceChildren();

    if (!visibleFriends.length) {
      const empty = document.createElement("li");
      empty.className = "friends-empty";
      empty.textContent = normalizedQuery
        ? "Nu am găsit nume potrivite în lista ta."
        : "Lista ta este goală. Caută și adaugă un nume.";
      friendsList.append(empty);
      return;
    }

    visibleFriends.forEach((friend) => {
      const item = document.createElement("li");
      item.className = "friend-item";
      const avatar = document.createElement("span");
      avatar.className = "friend-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = friend.trim().charAt(0).toLocaleUpperCase("ro") || "?";
      const name = document.createElement("span");
      name.className = "friend-name";
      name.textContent = friend;
      const removeButton = document.createElement("button");
      removeButton.className = "friend-remove-button";
      removeButton.type = "button";
      removeButton.textContent = "Elimină";
      removeButton.setAttribute("aria-label", `Elimină ${friend} din lista locală`);
      removeButton.addEventListener("click", () => {
        saveFriends(loadFriends().filter((savedFriend) => savedFriend !== friend));
      });
      item.append(avatar, name, removeButton);
      friendsList.append(item);
    });
  }

  function saveFriends(friends) {
    try {
      localStorage.setItem(friendsStorageKey, JSON.stringify(friends));
    } catch (error) {
      console.error("Could not save the local friends list.", error);
      friendsStatus.textContent = "Nu am putut salva lista. Verifică spațiul disponibil în browser.";
      return false;
    }
    friendsStatus.textContent = "";
    renderFriends(friendsSearchInput.value);
    return true;
  }

  function loadProfileDetails() {
    profileUsername.textContent = readStoredValue(profileNameKey, "Explorator");
    const savedVisits = readStoredValue(profileVisitsKey, "[]");
    let visits = [];
    try {
      visits = savedVisits === "Indisponibil" ? [] : JSON.parse(savedVisits);
      if (!Array.isArray(visits)) throw new Error("Stored place visits are not a list.");
    } catch (error) {
      console.error("Could not parse saved place visits for the profile.", error);
    }

    const uniquePlaces = new Set(visits.map((visit) => visit.venue).filter(Boolean)).size;
    const badges = [
      { label: "Primul pas", detail: "Explorează prima locație", earned: uniquePlaces >= 1, icon: "✦" },
      { label: "Explorator", detail: "Descoperă 3 locații", earned: uniquePlaces >= 3, icon: "⌖" },
      { label: "Cunoscător", detail: "Descoperă 5 locații", earned: uniquePlaces >= 5, icon: "★" },
    ];
    profileBadges.replaceChildren();
    badges.forEach((badge) => {
      const item = document.createElement("div");
      item.className = `profile-badge${badge.earned ? " earned" : " locked"}`;
      item.title = badge.detail;
      const icon = document.createElement("span");
      icon.className = "profile-badge-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = badge.icon;
      const label = document.createElement("span");
      label.className = "profile-badge-label";
      label.textContent = badge.label;
      item.append(icon, label);
      profileBadges.append(item);
    });

    profilePlacesList.replaceChildren();
    const mostVisited = visits
      .filter((visit) => visit && typeof visit.venue === "string" && Number.isFinite(visit.count))
      .sort((left, right) => right.count - left.count || left.venue.localeCompare(right.venue, "ro"))
      .slice(0, 5);
    if (!mostVisited.length) {
      const empty = document.createElement("li");
      empty.className = "profile-places-empty";
      empty.textContent = "Locurile pe care le explorezi vor apărea aici.";
      profilePlacesList.append(empty);
    } else {
      mostVisited.forEach((visit) => {
        const item = document.createElement("li");
        item.className = "profile-place-item";
        const details = document.createElement("div");
        details.className = "profile-place-details";
        const venue = document.createElement("strong");
        venue.textContent = visit.venue;
        const event = document.createElement("span");
        event.textContent = visit.eventTitle || "Locație explorată";
        const count = document.createElement("span");
        count.className = "profile-place-count";
        count.textContent = `${visit.count} ${visit.count === 1 ? "vizită" : "vizite"}`;
        details.append(venue, event);
        item.append(details, count);
        profilePlacesList.append(item);
      });
    }
  }

  homeButton.addEventListener("click", () => setNavigationView("home"));
  featuresButton.addEventListener("click", () => {
    setNavigationView(floatingPanel.classList.contains("is-open") ? "home" : "features");
  });
  friendsButton.addEventListener("click", () => {
    const isOpening = friendsPanel.hidden;
    setNavigationView(isOpening ? "friends" : "home");
    if (isOpening) renderFriends();
  });
  friendsFindButton.addEventListener("click", () => {
    const isExpanded = friendsFindButton.getAttribute("aria-expanded") === "true";
    friendsFindButton.setAttribute("aria-expanded", String(!isExpanded));
    friendsSearchForm.hidden = isExpanded;
    if (isExpanded) {
      friendsSearchInput.value = "";
      friendsStatus.textContent = "";
      renderFriends();
    } else {
      friendsSearchInput.focus();
    }
  });
  friendsSearchInput.addEventListener("input", () => renderFriends(friendsSearchInput.value));
  friendsSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = friendsSearchInput.value.trim();
    if (!name) {
      friendsStatus.textContent = "Scrie un nume pentru a-l adăuga în lista locală.";
      friendsSearchInput.focus();
      return;
    }
    const friends = loadFriends();
    if (friends.some((friend) => friend.toLocaleLowerCase("ro") === name.toLocaleLowerCase("ro"))) {
      friendsStatus.textContent = `${name} este deja în lista ta.`;
      return;
    }
    if (saveFriends([...friends, name])) {
      friendsSearchInput.value = "";
      renderFriends();
      friendsStatus.textContent = `${name} a fost adăugat în lista locală.`;
    }
  });
  searchButton.addEventListener("click", () => {
    const isOpen = !searchPanel.hidden;
    setNavigationView(isOpen ? "home" : "search");
    if (!isOpen) searchInput.focus();
  });
  searchInput.addEventListener("input", renderSearchResults);
  searchFilters.addEventListener("click", (event) => {
    const filterButton = event.target.closest(".search-filter");
    if (!filterButton) return;
    activeSearchCategory = filterButton.dataset.category;
    searchFilters.querySelectorAll(".search-filter").forEach((button) => {
      const isActive = button === filterButton;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    renderSearchResults();
  });
  profileButton.addEventListener("click", () => {
    const isOpen = !profilePanel.hidden;
    if (!isOpen) {
      loadProfileDetails();
      profileNameEditor.hidden = true;
    }
    setNavigationView(isOpen ? "home" : "profile");
  });
  document.querySelector("#profile-edit-name").addEventListener("click", () => {
    profileNameInput.value = profileUsername.textContent;
    profileNameEditor.hidden = false;
    profileNameInput.focus();
  });
  profileNameEditor.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = profileNameInput.value.trim();
    if (!name) {
      profileNameInput.setCustomValidity("Introdu un nume pentru profil.");
      profileNameInput.reportValidity();
      profileNameInput.setCustomValidity("");
      return;
    }
    try {
      localStorage.setItem(profileNameKey, name);
    } catch (error) {
      console.error("Could not save the local profile name.", error);
      return;
    }
    profileUsername.textContent = name;
    profileNameEditor.hidden = true;
  });
  document.querySelector("#profile-name-cancel").addEventListener("click", () => {
    profileNameEditor.hidden = true;
  });
  profileCloseButton.addEventListener("click", () => setNavigationView("home"));
  friendsCloseButton.addEventListener("click", () => setNavigationView("home"));
  searchCloseButton.addEventListener("click", () => setNavigationView("home"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setNavigationView("home");
  });
})();
