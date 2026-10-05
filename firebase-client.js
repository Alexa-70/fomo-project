(function () {
  const config = window.FOMO_FIREBASE_CONFIG;
  const configured = config &&
    ["apiKey", "authDomain", "projectId", "appId"].every((key) =>
      typeof config[key] === "string" &&
      config[key].length > 0 &&
      !config[key].startsWith("COMPLETEAZA_")
    );

  if (!configured || !window.firebase) {
    window.FomoFirebase = { configured: false };
    window.dispatchEvent(new CustomEvent("fomo-firebase-ready"));
    return;
  }

  try {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
    const auth = app.auth();
    const db = app.database();
    window.FomoFirebase = {
      configured: true,
      auth,
      db,
      user: () => auth.currentUser,
      ensureUserProfile: async (user) => {
        if (!user || typeof user.uid !== "string" || !user.uid) {
          throw new Error("Este necesară autentificarea pentru profilul Firebase.");
        }
        if (typeof user.email !== "string" || !user.email) {
          throw new Error("Contul Firebase nu are o adresă de email validă.");
        }

        const profileRef = db.ref(`users/${user.uid}`);
        const existingProfile = await profileRef.once("value");
        if (existingProfile.exists()) {
          const profile = existingProfile.val();
          const needsGamificationDefaults =
            !Object.prototype.hasOwnProperty.call(profile, "xp") ||
            !Object.prototype.hasOwnProperty.call(profile, "level") ||
            !Object.prototype.hasOwnProperty.call(profile, "rank_title");

          if (!needsGamificationDefaults) return profile;

          const migration = await profileRef.transaction((currentProfile) => {
            if (!currentProfile) return;
            return {
              ...currentProfile,
              xp: currentProfile.xp === undefined ? 0 : currentProfile.xp,
              level: currentProfile.level === undefined ? 1 : currentProfile.level,
              rank_title: currentProfile.rank_title === undefined
                ? "FOMO Explorer"
                : currentProfile.rank_title,
            };
          });
          if (!migration.committed || !migration.snapshot.exists()) {
            throw new Error("Profilul nu a putut fi actualizat la schema de gamification.");
          }
          return migration.snapshot.val();
        }

        const emailName = user.email.split("@")[0].slice(0, 80);
        const username = typeof user.displayName === "string" && user.displayName.trim()
          ? user.displayName.trim().slice(0, 80)
          : emailName || "Utilizator";
        const profile = {
          email: user.email,
          username,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          xp: 0,
          level: 1,
          rank_title: "FOMO Explorer",
        };

        try {
          await profileRef.set(profile);
        } catch (writeError) {
          try {
            const concurrentProfile = await profileRef.once("value");
            if (concurrentProfile.exists()) return concurrentProfile.val();
          } catch {
            throw writeError;
          }
          throw writeError;
        }

        const savedProfile = await profileRef.once("value");
        if (!savedProfile.exists()) {
          throw new Error("Profilul nu a fost găsit după salvarea în Firebase.");
        }
        return savedProfile.val();
      },
      locations: async () => {
        const [snapshot, catalogResponse] = await Promise.all([
          db.ref("locations").once("value"),
          fetch("./locations.json"),
        ]);
        if (!catalogResponse.ok) {
          throw new Error(`Catalogul foto nu a putut fi încărcat (${catalogResponse.status}).`);
        }
        const catalog = await catalogResponse.json();
        if (!Array.isArray(catalog)) {
          throw new Error("Catalogul foto are un format invalid.");
        }
        const catalogById = new Map(catalog.map((location) => [location.id, location]));
        return Object.entries(snapshot.val() || {})
          .map(([id, location]) => {
            const catalogLocation = catalogById.get(id);
            return {
              id,
              ...location,
              imageUrl: location.imageUrl || catalogLocation?.imageUrl,
            };
          })
          .sort((left, right) =>
            left.city.localeCompare(right.city, "ro") ||
            left.name.localeCompare(right.name, "ro")
          );
      },
    };
    window.dispatchEvent(new CustomEvent("fomo-firebase-ready"));
  } catch (error) {
    console.error("Firebase could not be initialized.", error);
    window.FomoFirebase = { configured: false, error };
    window.dispatchEvent(new CustomEvent("fomo-firebase-ready"));
  }
})();
