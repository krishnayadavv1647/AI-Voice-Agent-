export function loadDograhWidget(embedToken) {
  return new Promise((resolve, reject) => {
    if (!embedToken) {
      reject(new Error("Dograh embed token missing."));
      return;
    }

    if (window.DograhWidget && window.__dograhWidgetEmbedToken === embedToken) {
      resolve(window.DograhWidget);
      return;
    }

    const existing = document.getElementById("dograh-widget");
    if (existing) existing.remove();
    if (window.DograhWidget && window.__dograhWidgetEmbedToken !== embedToken) {
      delete window.DograhWidget;
    }

    const script = document.createElement("script");
    script.id = "dograh-widget";
    script.src =
      `https://app.dograh.com/embed/dograh-widget.js?token=${encodeURIComponent(embedToken)}&environment=production&apiEndpoint=https://api.dograh.com`;
    script.async = true;

    script.onload = () => {
      if (window.DograhWidget) {
        window.__dograhWidgetEmbedToken = embedToken;
        resolve(window.DograhWidget);
      } else {
        reject(new Error("DograhWidget not found."));
      }
    };

    script.onerror = () => {
      reject(new Error("Dograh widget failed to load."));
    };

    document.body.appendChild(script);
  });
}
