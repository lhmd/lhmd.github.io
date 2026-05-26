const canvas = document.querySelector("#teaserCanvas");
const statusEl = document.querySelector("#teaserStatus");

let playground = null;
let playgroundPromise = null;
let isPreparing = false;
const preloadMargin = 80;

if (canvas) {
  canvas.dataset.runtimeScene ||= "dl3dv-1";
  canvas.dataset.runtimeCameraHeightScale ||= "1";
}

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.classList.remove("is-hidden");
}

function hideStatus() {
  statusEl?.classList.add("is-hidden");
}

async function loadPlayground() {
  if (!canvas) return null;
  playgroundPromise ??= import("./teaser-playground.js?v=27").then((module) => module.createTeaserPlayground());
  playground = await playgroundPromise;
  return playground;
}

async function setPlaygroundActive(isActive) {
  if (!canvas) return;
  if (!isActive && playground) {
    playground.pause();
    return;
  }

  if (isActive) {
    if (playground) {
      playground.resume();
      if (canvas.dataset.runtimeScene) hideStatus();
      return;
    }
    if (!isPreparing) setStatus("Preparing interactive scene...");
    isPreparing = true;
    try {
      const instance = await loadPlayground();
      instance?.resume();
      await instance?.ready;
    } catch (error) {
      console.error(error);
      setStatus("Could not prepare interactive scene", true);
    } finally {
      isPreparing = false;
    }
  }
}

if (canvas) {
  const observer = new IntersectionObserver(
    (entries) => {
      setPlaygroundActive(entries.some((entry) => entry.isIntersecting));
    },
    { rootMargin: `${preloadMargin}px 0px`, threshold: 0.01 },
  );

  observer.observe(canvas);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      playground?.pause();
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    if (bounds.top < window.innerHeight + preloadMargin && bounds.bottom > -preloadMargin) {
      setPlaygroundActive(true);
    } else {
      playground?.pause();
    }
  });
}
