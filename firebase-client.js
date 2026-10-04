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
        if (existingProfile.exists()) return existingProfile.val();

        const emailName = user.email.split("@")[0].slice(0, 80);
        const username = typeof user.displayName === "string" && user.displayName.trim()
          ? user.displayName.trim().slice(0, 80)
          : emailName || "Utilizator";
        const profile = {
          email: user.email,
          username,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
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
        const snapshot = await db.ref("locations").once("value");
        return Object.entries(snapshot.val() || {})
          .map(([id, location]) => ({ id, ...location }))
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
