export function loadDograhWidget(scriptUrl) {
  return new Promise((resolve, reject) => {
    if (!scriptUrl) {
      reject(new Error("Paste Dograh embed code first."));
      return;
    }

    const normalizedScriptUrl = String(scriptUrl).trim();

    if (window.DograhWidget && window.__dograhWidgetScriptUrl === normalizedScriptUrl) {
      resolve(window.DograhWidget);
      return;
    }

    const existing = document.getElementById("dograh-widget");
    if (existing) existing.remove();
    if (window.DograhWidget && window.__dograhWidgetScriptUrl !== normalizedScriptUrl) {
      delete window.DograhWidget;
    }

    const script = document.createElement("script");
    script.id = "dograh-widget";
    script.src = normalizedScriptUrl;
    script.async = true;
    script.onload = () => {
      if (window.DograhWidget) {
        window.__dograhWidgetScriptUrl = normalizedScriptUrl;
        resolve(window.DograhWidget);
      } else {
        reject(new Error("Dograh widget script failed to load."));
      }
    };
    script.onerror = () => reject(new Error("Dograh widget script failed to load."));
    document.body.appendChild(script);
  });
}
