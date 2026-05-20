import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const targetUrl = "http://localhost:8080/";
const viewports = [
  { name: "desktop", width: 1440, height: 1200 },
  { name: "tablet", width: 900, height: 1100 },
  { name: "mobile", width: 390, height: 1000 },
];
const scrollTargets = ["top", "overview", "interactive", "method", "results", "bibtex"];

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Chrome is still starting.
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function cdp(method, params, idRef, ws) {
  const id = ++idRef.value;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data.toString());
      if (message.id !== id) return;
      ws.removeEventListener("message", onMessage);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    };
    ws.addEventListener("message", onMessage);
  });
}

function fail(message, details = {}) {
  return { ok: false, message, ...details };
}

const userDataDir = await mkdtemp(path.join(tmpdir(), "trisplat-qa-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=9333",
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: "ignore" });

const failures = [];

try {
  const tabs = await waitForJson("http://127.0.0.1:9333/json");
  const tab = tabs.find((item) => item.type === "page") ?? tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const idRef = { value: 0 };

  await cdp("Page.enable", {}, idRef, ws);
  await cdp("Runtime.enable", {}, idRef, ws);

  for (const viewport of viewports) {
    await cdp(
      "Emulation.setDeviceMetricsOverride",
      { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 600 },
      idRef,
      ws,
    );
    await cdp("Network.enable", {}, idRef, ws);
    await cdp("Page.navigate", { url: targetUrl }, idRef, ws);
    await delay(1400);

    for (const target of scrollTargets) {
      await cdp(
        "Runtime.evaluate",
        {
          expression:
            target === "top"
              ? "scrollTo(0, 0)"
              : `document.getElementById(${JSON.stringify(target)})?.scrollIntoView({ block: 'start' })`,
        },
        idRef,
        ws,
      );
      await delay(target === "interactive" ? 900 : 300);

      const result = await cdp(
        "Runtime.evaluate",
        {
          returnByValue: true,
          expression: `(() => {
          const viewport = { width: innerWidth, height: innerHeight };
          const doc = document.documentElement;
          const body = document.body;
          const failures = [];
          const visible = (el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 1 && rect.height > 1;
          };
          const nearViewport = (el) => {
            const r = el.getBoundingClientRect();
            return r.bottom > -viewport.height * 0.25 && r.top < viewport.height * 1.25;
          };
          const rectOf = (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
          };
          const important = [...document.querySelectorAll('header, .hero-copy, .hero-media, .wide-figure, .method-card, .result-card, .protocol-item, .teaser-sim-stage, .viewer-heading, .mesh-card, .mesh-frame, .bib-card, footer')].filter(visible);
          for (const el of important) {
            const r = el.getBoundingClientRect();
            const insideMeshRail = !!el.closest('.mesh-group-grid');
            if (!insideMeshRail && (r.right > viewport.width + 2 || r.left < -2)) failures.push({ type: 'horizontal-overflow', selector: el.className || el.tagName, rect: rectOf(el) });
            if (r.height > viewport.height * 1.05 && !el.matches('.teaser-sim-stage, .mesh-frame, .mesh-card')) failures.push({ type: 'too-tall-element', selector: el.className || el.tagName, rect: rectOf(el) });
          }
          const textItems = [...document.querySelectorAll('.hero h1, .subtitle, .subtitle span, .hero-summary, .author-list a, .affiliations, .affiliations span, .author-note, .button-row .button, .section-heading h2, .section-heading p, .copy-block p, figcaption, .media-caption span, .nav-links a')].filter((el) => visible(el) && nearViewport(el));
          for (const el of textItems) {
            const r = el.getBoundingClientRect();
            if (r.right > viewport.width + 1 || r.left < -1) failures.push({ type: 'text-visual-overflow', selector: el.className || el.tagName, text: el.textContent.trim().slice(0, 80), rect: rectOf(el) });
            const style = getComputedStyle(el);
            if (el.scrollWidth > el.clientWidth + 2 && style.overflow === 'visible' && !el.matches('h1, h2')) failures.push({ type: 'text-scroll-overflow', selector: el.className || el.tagName, text: el.textContent.trim().slice(0, 80), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, rect: rectOf(el) });
          }
          const controls = document.querySelector('.sim-controls')?.getBoundingClientRect();
          const hud = document.querySelector('.sim-hud')?.getBoundingClientRect();
          const fpv = document.querySelector('.fpv-label')?.getBoundingClientRect();
          const stage = document.querySelector('.teaser-sim-stage')?.getBoundingClientRect();
          const overlaps = (a, b) => a && b && Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) > 4;
          if (stage && stage.bottom > 0 && stage.top < viewport.height) {
            if (overlaps(controls, hud)) failures.push({ type: 'sim-controls-hud-overlap', controls, hud });
            if (overlaps(controls, fpv)) failures.push({ type: 'sim-controls-fpv-overlap', controls, fpv });
            if (overlaps(hud, fpv)) failures.push({ type: 'sim-hud-fpv-overlap', hud, fpv });
          }

          const sections = [...document.querySelectorAll('main > section')].map((section) => ({ id: section.id || section.className, rect: rectOf(section) }));
          for (let i = 1; i < sections.length; i++) {
            const gap = sections[i].rect.y - sections[i - 1].rect.bottom;
            if (gap > viewport.height * 0.55) failures.push({ type: 'large-section-gap', before: sections[i - 1].id, after: sections[i].id, gap });
          }

          const heroVideo = document.querySelector('.hero-video');
          const heroVideoRect = heroVideo ? rectOf(heroVideo) : null;
          const meshCards = [...document.querySelectorAll('.mesh-card')].map((card) => rectOf(card));
          const firstMeshRowCount = meshCards.filter((rect, _, cards) => cards.length && Math.abs(rect.y - cards[0].y) < 8).length;
          const meshGroupFirstRows = [...document.querySelectorAll('.mesh-group-grid')].map((grid) => {
            const cards = [...grid.querySelectorAll('.mesh-card')].map((card) => rectOf(card));
            return cards.filter((rect, _, all) => all.length && Math.abs(rect.y - all[0].y) < 8).length;
          });
          const meshGroupRails = [...document.querySelectorAll('.mesh-group-grid')].map((grid) => {
            const cards = [...grid.querySelectorAll('.mesh-card')].map((card) => rectOf(card));
            const arrowCount = grid.closest('.mesh-rail-shell')?.querySelectorAll('.mesh-rail-arrow').length ?? 0;
            const gridRect = rectOf(grid);
            return {
              cardCount: cards.length,
              rowCount: new Set(cards.map((rect) => Math.round(rect.y))).size,
              visibleCards: cards.filter((rect) => rect.right > gridRect.x + 1 && rect.x < gridRect.right - 1).length,
              scrollWidth: grid.scrollWidth,
              clientWidth: grid.clientWidth,
              arrowCount,
            };
          });
          const meshCardsData = [...document.querySelectorAll('.mesh-card')].map((card) => ({
            groupId: card.closest('.mesh-group')?.dataset.meshGroup,
            title: card.querySelector('.mesh-card-header h3')?.textContent.trim(),
            datasetGroup: card.querySelector('.mesh-card-meta')?.textContent.trim(),
            src: card.dataset.src,
            viewX: card.dataset.viewX ?? null,
            viewZ: card.dataset.viewZ ?? null,
            viewFlip: card.dataset.viewFlip ?? null,
            frameScale: card.dataset.frameScale ?? null,
          }));
          const runtimeOptions = [...document.querySelectorAll('#runtimeSceneSelect option')].map((option) => ({
            value: option.value,
            label: option.textContent.trim(),
          }));
          const runtimeSource = document.querySelector('script[src*="teaser-sim.js"]')?.getAttribute('src') || '';
          const heroTitleRect = rectOf(document.querySelector('.hero h1'));
          const subtitleRect = rectOf(document.querySelector('.subtitle'));
          const titleSubtitleGap = subtitleRect.y - heroTitleRect.bottom;
          const headingAlignment = [];
          for (const [headingSelector, contentSelector] of [
            ['.playground-heading h2', '.teaser-sim-stage'],
            ['.viewer-heading .section-heading h2', '.mesh-grid'],
            ['#method > .section-heading h2', '#method .wide-figure'],
            ['#results > .section-heading h2', '#results .result-gallery'],
            ['#bibtex > .section-heading h2', '#bibtex .bib-card'],
          ]) {
            const heading = document.querySelector(headingSelector);
            const content = document.querySelector(contentSelector);
            if (heading && content) {
              headingAlignment.push({
                headingSelector,
                contentSelector,
                delta: Math.abs(heading.getBoundingClientRect().left - content.getBoundingClientRect().left),
              });
            }
          }
          const videoSources = heroVideo ? heroVideo.querySelectorAll('source').length : -1;
          const heavyScriptsLoaded = [...performance.getEntriesByType('resource')].filter((entry) => /three\\.module|teaser-playground|\\.ply|trisplat-demo-lite|trisplat-demo-web|trisplat-demo-720/.test(entry.name)).map((entry) => entry.name);

          return {
            viewport,
            target: ${JSON.stringify(target)},
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            bodyHeight: body.getBoundingClientRect().height,
            failures,
            videoSources,
            heavyScriptsLoaded,
            heroVideoRect,
            meshCards,
            firstMeshRowCount,
            meshGroupFirstRows,
            meshGroupRails,
            meshCardsData,
            runtimeOptions,
            runtimeSource,
            titleSubtitleGap,
            headingAlignment,
          };
        })()`,
        },
        idRef,
        ws,
      );

      const value = result.result.value;
      const label = `${viewport.name}/${target}`;
      if (value.scrollWidth > value.clientWidth + 2) failures.push(fail(`${label}: document overflows horizontally`, value));
      for (const item of value.failures) failures.push(fail(`${label}: ${item.type}`, item));
      if (value.videoSources !== 0) failures.push(fail(`${label}: hero video source should not be injected before interaction`, { videoSources: value.videoSources }));
      if (label === "mobile/top" && value.heroVideoRect && value.heroVideoRect.y < value.viewport.height * 0.78) failures.push(fail(`${label}: hero video should start on the second screen`, { heroVideoRect: value.heroVideoRect, viewport: value.viewport }));
      if (label.endsWith("/top") && value.titleSubtitleGap < 12) failures.push(fail(`${label}: hero title overlaps subtitle`, { titleSubtitleGap: value.titleSubtitleGap }));
      for (const alignment of value.headingAlignment) {
        if (alignment.delta > 3) failures.push(fail(`${label}: section heading is not aligned with content`, alignment));
      }
      if (label === "desktop/interactive") {
        const teaserCard = value.meshCardsData.find((card) => card.title === "Teaser Scene");
        if (teaserCard?.groupId !== "outdoor") failures.push(fail(`${label}: Teaser Scene should be grouped with outdoor scenes`, { teaserCard }));
        const f70Card = value.meshCardsData.find((card) => card.title === "Scene F70");
        if (f70Card?.viewX !== "0" || f70Card?.viewZ !== "1") failures.push(fail(`${label}: Scene F70 should open from the corrected +Z view`, { f70Card }));
        if (f70Card?.frameScale !== "0.72") failures.push(fail(`${label}: Scene F70 should use a closer initial frame`, { f70Card }));
        const dl3dvCards = value.meshCardsData.filter((card) => card.datasetGroup === "DL3DV");
        if (dl3dvCards.some((card) => !card.src.includes('/gallery-web/dl3dv/'))) failures.push(fail(`${label}: DL3DV viewers should use cropped browser-friendly meshes`, { dl3dvCards }));
        const re10kCards = value.meshCardsData.filter((card) => card.datasetGroup === "RE10K");
        const scene10Card = re10kCards.find((card) => card.title === "Scene 10");
        const re10kFlipCards = re10kCards.filter((card) => card.title !== "Scene 10");
        if (!scene10Card || scene10Card.viewX !== "0" || scene10Card.viewZ !== "1" || scene10Card.viewFlip === "true") {
          failures.push(fail(`${label}: Scene 10 should use its manual +Z initial view`, { scene10Card }));
        }
        if (!re10kFlipCards.length || re10kFlipCards.some((card) => card.viewFlip !== "true")) failures.push(fail(`${label}: remaining RE10K viewers should flip their initial view by 180 degrees`, { re10kFlipCards }));

        const runtimeLabels = value.runtimeOptions.map((option) => option.label);
        if (value.runtimeOptions.length !== 8) failures.push(fail(`${label}: runtime should expose only the curated operable scene set`, { runtimeOptions: value.runtimeOptions }));
        if (runtimeLabels[0] !== "DL3DV-Outdoor-1") failures.push(fail(`${label}: runtime should default to Scene BA55 as DL3DV-Outdoor-1`, { runtimeLabels }));
        if (runtimeLabels.some((labelText) => /^Scene\\s|Living Room|Loft|Studio|Pruned/.test(labelText))) failures.push(fail(`${label}: runtime labels should use dataset-location numbering`, { runtimeLabels }));
        for (const expected of ["DL3DV-Outdoor-1", "DL3DV-Outdoor-2", "DL3DV-Indoor-1", "RE10K-Indoor-1", "RE10K-Indoor-3"]) {
          if (!runtimeLabels.includes(expected)) failures.push(fail(`${label}: runtime is missing ${expected}`, { runtimeLabels }));
        }
        if (runtimeLabels.some((labelText) => /DL3DV-Outdoor-3|RE10K-Indoor-4|RE10K-Indoor-[5-8]/.test(labelText))) failures.push(fail(`${label}: runtime should omit removed or unsuitable scenes`, { runtimeLabels }));
        if (!value.runtimeSource.includes("v=27")) failures.push(fail(`${label}: runtime loader cache should be bumped`, { runtimeSource: value.runtimeSource }));

        for (const rail of value.meshGroupRails) {
          if (rail.rowCount !== 1) failures.push(fail(`${label}: each mesh group should stay in one horizontal row`, { rail }));
          if (rail.visibleCards < Math.min(3, rail.cardCount)) failures.push(fail(`${label}: mesh rail should show at least three viewers when available`, { rail }));
          if (rail.cardCount > rail.visibleCards && rail.scrollWidth <= rail.clientWidth + 2) failures.push(fail(`${label}: mesh rail should scroll horizontally when it has hidden cards`, { rail }));
          if (rail.arrowCount !== 0) failures.push(fail(`${label}: mesh rail side arrow buttons should be removed`, { rail }));
        }
      }
      const beforeInteractive = target === "top";
      const allowedAfterInteractive = /three\.module|teaser-playground|\.ply|OrbitControls|PLYLoader/;
      const unexpectedHeavy = value.heavyScriptsLoaded.filter((resource) =>
        beforeInteractive ? true : !allowedAfterInteractive.test(resource),
      );
      if (unexpectedHeavy.length) failures.push(fail(`${label}: unexpected heavy resources loaded`, { resources: unexpectedHeavy }));
    }
  }

  ws.close();
} finally {
  chrome.kill("SIGTERM");
  await delay(300);
  await rm(userDataDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("layout qa passed");
