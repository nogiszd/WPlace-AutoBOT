(async () => {
  const CONFIG = {
    START_X: 742,
    START_Y: 1148,
    PIXELS_PER_LINE: 100,
    DELAY: 1000,
    THEME: {
      primary: "#000000",
      secondary: "#111111",
      accent: "#222222",
      text: "#ffffff",
      highlight: "#775ce3",
      success: "#00ff00",
      error: "#ff0000",
    },
  };

  const state = {
    running: false,
    paintedCount: 0,
    charges: { count: 0, max: 80, cooldownMs: 30000 },
    userInfo: null,
    lastPixel: null,
    minimized: false,
    menuOpen: false,
    language: "en",
    autoRefresh: true,
    pausedForManual: false,
    // Coordinate capture state
    selectingCoordinates: false,
    capturingLeftUpper: false,
    capturingRightBottom: false,
    capturedCoords: {
      leftUpper: null,
      rightBottom: null,
    },
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitForSelector = async (selector, interval = 200, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(interval);
    }
    return null;
  };

  const originalFetch = window.fetch;
  let capturedCaptchaToken = null;
  window.fetch = async (url, options = {}) => {
    if (
      typeof url === "string" &&
      url.includes("https://backend.wplace.live/s0/pixel/")
    ) {
      try {
        const payload = JSON.parse(options.body || "{}");
        if (payload.t) {
          console.log("✅ CAPTCHA Token Captured:", payload.t);
          capturedCaptchaToken = payload.t;
          if (state.pausedForManual) {
            state.pausedForManual = false;
            state.running = true;
            updateUI(
              state.language === "pt"
                ? "🚀 Pintura reiniciada!"
                : "🚀 Farm resumed!",
              "success"
            );
            paintLoop();
          }
        }

        // Capture coordinates if we're in coordinate selection mode
        if (
          state.selectingCoordinates &&
          payload.coords &&
          Array.isArray(payload.coords)
        ) {
          const regionMatch = url.match(/\/pixel\/(\d+)\/(\d+)/);
          if (regionMatch && regionMatch.length >= 3) {
            const regionX = Number.parseInt(regionMatch[1]);
            const regionY = Number.parseInt(regionMatch[2]);
            const pixelX = payload.coords[0];
            const pixelY = payload.coords[1];

            // Calculate absolute coordinates
            const absoluteX = regionX * 1000 + pixelX;
            const absoluteY = regionY * 1000 + pixelY;

            console.log(
              `📍 Coordinates captured: X=${absoluteX}, Y=${absoluteY} (Region: ${regionX},${regionY}, Pixel: ${pixelX},${pixelY})`
            );

            // Store the coordinates based on which button was clicked
            if (state.capturingLeftUpper) {
              state.capturedCoords.leftUpper = { x: absoluteX, y: absoluteY };
              updateUI(
                state.language === "pt"
                  ? `✅ Canto superior esquerdo capturado: X=${absoluteX}, Y=${absoluteY}`
                  : `✅ Left upper corner captured: X=${absoluteX}, Y=${absoluteY}`,
                "success"
              );
            } else if (state.capturingRightBottom) {
              state.capturedCoords.rightBottom = { x: absoluteX, y: absoluteY };
              updateUI(
                state.language === "pt"
                  ? `✅ Canto inferior direito capturado: X=${absoluteX}, Y=${absoluteY}`
                  : `✅ Right bottom corner captured: X=${absoluteX}, Y=${absoluteY}`,
                "success"
              );
            }

            // Auto-fill boundary inputs if both coordinates are captured
            if (
              state.capturedCoords.leftUpper &&
              state.capturedCoords.rightBottom
            ) {
              autoFillBoundaries();
            }
          }
        }
      } catch (e) {}
    }
    return originalFetch(url, options);
  };

  const fetchAPI = async (url, options = {}) => {
    try {
      const res = await fetch(url, {
        credentials: "include",
        ...options,
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  };

  const getRandomPosition = () => {
    // Check if we have captured coordinates for custom area
    if (state.capturedCoords.leftUpper && state.capturedCoords.rightBottom) {
      const leftUpper = state.capturedCoords.leftUpper;
      const rightBottom = state.capturedCoords.rightBottom;

      // Calculate the area dimensions
      const minX = Math.min(leftUpper.x, rightBottom.x);
      const maxX = Math.max(leftUpper.x, rightBottom.x);
      const minY = Math.min(leftUpper.y, rightBottom.y);
      const maxY = Math.max(leftUpper.y, rightBottom.y);

      // Generate random position within the captured area
      return {
        x: Math.floor(Math.random() * (maxX - minX + 1)) + minX,
        y: Math.floor(Math.random() * (maxY - minY + 1)) + minY,
      };
    } else {
      // Use default method: random within 100x100 area
      return {
        x: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE),
        y: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE),
      };
    }
  };

  const startCoordinateCapture = (corner) => {
    if (state.selectingCoordinates) {
      updateUI(
        state.language === "pt"
          ? "❌ Já capturando coordenadas. Aguarde..."
          : "❌ Already capturing coordinates. Please wait...",
        "error"
      );
      return;
    }

    state.selectingCoordinates = true;
    if (corner === "leftUpper") {
      state.capturingLeftUpper = true;
      state.capturingRightBottom = false;
      updateUI(
        state.language === "pt"
          ? "📍 Clique em qualquer pixel para capturar o canto superior esquerdo..."
          : "📍 Click any pixel to capture left upper corner...",
        "default"
      );
    } else if (corner === "rightBottom") {
      state.capturingRightBottom = true;
      state.capturingLeftUpper = false;
      updateUI(
        state.language === "pt"
          ? "📍 Clique em qualquer pixel para capturar o canto inferior direito..."
          : "📍 Click any pixel to capture right bottom corner...",
        "default"
      );
    }

    // Set a timeout to stop coordinate capture
    setTimeout(() => {
      if (state.selectingCoordinates) {
        state.selectingCoordinates = false;
        state.capturingLeftUpper = false;
        state.capturingRightBottom = false;
        updateUI(
          state.language === "pt"
            ? "⏰ Tempo esgotado para captura de coordenadas"
            : "⏰ Timeout for coordinate capture",
          "error"
        );
      }
    }, 60000); // 1 minute timeout
  };

  const autoFillBoundaries = () => {
    if (!state.capturedCoords.leftUpper || !state.capturedCoords.rightBottom) {
      return;
    }

    const leftUpper = state.capturedCoords.leftUpper;
    const rightBottom = state.capturedCoords.rightBottom;

    // Calculate area dimensions
    const minX = Math.min(leftUpper.x, rightBottom.x);
    const maxX = Math.max(leftUpper.x, rightBottom.x);
    const minY = Math.min(leftUpper.y, rightBottom.y);
    const maxY = Math.max(leftUpper.y, rightBottom.y);

    updateUI(
      state.language === "pt"
        ? `✅ Área de pintura definida: X(${minX}-${maxX}) Y(${minY}-${maxY})`
        : `✅ Painting area defined: X(${minX}-${maxX}) Y(${minY}-${maxY})`,
      "success"
    );

    // Reset coordinate capture state
    state.selectingCoordinates = false;
    state.capturingLeftUpper = false;
    state.capturingRightBottom = false;

    // Update the coordinate info display
    updateCoordinateInfo();
  };

  const resetCoordinates = () => {
    state.capturedCoords.leftUpper = null;
    state.capturedCoords.rightBottom = null;

    updateUI(
      state.language === "pt"
        ? "🔄 Coordenadas resetadas para padrão (100x100)"
        : "🔄 Coordinates reset to default (100x100)",
      "default"
    );

    // Update the coordinate info display
    updateCoordinateInfo();
  };

  const updateCoordinateInfo = () => {
    const coordinateInfo = document.querySelector("#coordinateInfo");
    if (coordinateInfo) {
      if (state.capturedCoords.leftUpper && state.capturedCoords.rightBottom) {
        const leftUpper = state.capturedCoords.leftUpper;
        const rightBottom = state.capturedCoords.rightBottom;
        const minX = Math.min(leftUpper.x, rightBottom.x);
        const maxX = Math.max(leftUpper.x, rightBottom.x);
        const minY = Math.min(leftUpper.y, rightBottom.y);
        const maxY = Math.max(leftUpper.y, rightBottom.y);

        coordinateInfo.innerHTML = `${
          state.language === "pt" ? "Área de Pintura" : "Painting Area"
        }: X(${minX}-${maxX}) Y(${minY}-${maxY})`;
      } else {
        coordinateInfo.innerHTML = "Default: Random 100x100 area";
      }
    }
  };

  const paintPixel = async (x, y) => {
    const randomColor = Math.floor(Math.random() * 31) + 1;
    const url = `https://backend.wplace.live/s0/pixel/${CONFIG.START_X}/${CONFIG.START_Y}`;
    const payload = JSON.stringify({
      coords: [x, y],
      colors: [randomColor],
      t: capturedCaptchaToken,
    });
    try {
      const res = await originalFetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        credentials: "include",
        body: payload,
      });
      if (res.status === 403) {
        console.error(
          "❌ 403 Forbidden. CAPTCHA token might be invalid or expired."
        );
        capturedCaptchaToken = null;
        stoppedForToken = true;
        return "token_error";
      }
      const data = await res.json();
      return data;
    } catch (e) {
      return null;
    }
  };

  const getCharge = async () => {
    const data = await fetchAPI("https://backend.wplace.live/me");
    if (data) {
      state.userInfo = data;
      state.charges = {
        count: Math.floor(data.charges.count),
        max: Math.floor(data.charges.max),
        cooldownMs: data.charges.cooldownMs,
      };
      if (state.userInfo.level) {
        state.userInfo.level = Math.floor(state.userInfo.level);
      }
    }
    return state.charges;
  };

  const detectUserLocation = async () => {
    try {
      const response = await fetch("https://ipapi.co/json/");
      const data = await response.json();
      if (data.country === "BR") {
        state.language = "pt";
      } else if (data.country === "US") {
        state.language = "en";
      } else {
        state.language = "en";
      }
    } catch {
      state.language = "en";
    }
  };

  const paintLoop = async () => {
    while (state.running) {
      const { count, cooldownMs } = state.charges;

      if (count < 1) {
        updateUI(
          state.language === "pt"
            ? `⌛ Sem cargas. Esperando ${Math.ceil(cooldownMs / 1000)}s...`
            : `⌛ No charges. Waiting ${Math.ceil(cooldownMs / 1000)}s...`,
          "status"
        );
        await sleep(cooldownMs);
        await getCharge();
        continue;
      }

      const randomPos = getRandomPosition();
      const paintResult = await paintPixel(randomPos.x, randomPos.y);
      if (paintResult === "token_error") {
        if (state.autoRefresh) {
          await getCharge();
          if (state.charges.count < 2) {
            if (!state.pausedForManual) {
              updateUI(
                state.language === "pt"
                  ? "⚡ Aguardando pelo menos 2 cargas para auto-refresh..."
                  : "Waiting for at least 2 charges for auto-refresh...",
                "status"
              );
              state.pausedForManual = true;
            }
            while (state.charges.count < 2) {
              await sleep(60000);
              await getCharge();
              updateStats();
            }
            state.pausedForManual = false;
          }
          updateUI(
            state.language === "pt"
              ? "❌ Token expirado. Aguardando elemento Paint..."
              : "❌ CAPTCHA token expired. Waiting for Paint button...",
            "error"
          );
          const mainPaintBtn = await waitForSelector(
            "button.btn.btn-primary.btn-lg, button.btn-primary.sm\\:btn-xl"
          );
          if (mainPaintBtn) mainPaintBtn.click();
          await sleep(500);
          updateUI(
            state.language === "pt"
              ? "Selecionando transparente..."
              : "Selecting transparent...",
            "status"
          );
          const transBtn = await waitForSelector("button#color-0");
          if (transBtn) transBtn.click();
          await sleep(500);
          const canvas = await waitForSelector("canvas");
          if (canvas) {
            canvas.setAttribute("tabindex", "0");
            canvas.focus();
            const rect = canvas.getBoundingClientRect();
            const centerX = Math.round(rect.left + rect.width / 2);
            const centerY = Math.round(rect.top + rect.height / 2);
            const moveEvt = new MouseEvent("mousemove", {
              clientX: centerX,
              clientY: centerY,
              bubbles: true,
            });
            canvas.dispatchEvent(moveEvt);
            const keyDown = new KeyboardEvent("keydown", {
              key: " ",
              code: "Space",
              bubbles: true,
            });
            const keyUp = new KeyboardEvent("keyup", {
              key: " ",
              code: "Space",
              bubbles: true,
            });
            canvas.dispatchEvent(keyDown);
            canvas.dispatchEvent(keyUp);
          }
          await sleep(500);
          updateUI(
            state.language === "pt"
              ? "Confirmando pintura..."
              : "Confirming paint...",
            "status"
          );
          let confirmBtn = await waitForSelector(
            "button.btn.btn-primary.btn-lg, button.btn.btn-primary.sm\\:btn-xl"
          );
          if (!confirmBtn) {
            const allPrimary = Array.from(
              document.querySelectorAll("button.btn-primary")
            );
            confirmBtn = allPrimary.length
              ? allPrimary[allPrimary.length - 1]
              : null;
          }
          confirmBtn?.click();
        } else {
          // insufficient charges or auto-refresh disabled
          if (state.autoRefresh && state.charges.count < 2) {
            updateUI(
              state.language === "pt"
                ? "⚡ Cargas insuficientes para auto-refresh. Por favor, clique manualmente."
                : "Insufficient charges for auto-refresh. Please click manually.",
              "error"
            );
          }
          if (!state.pausedForManual) {
            updateUI(
              state.language === "pt"
                ? "Auto-refresh desativado. Por favor, clique no botão pintura manualmente."
                : "Auto-refresh disabled. Please click the Paint button manually.",
              "status"
            );
            state.pausedForManual = true;
          }
          state.running = false;
          return;
        }
        await sleep(1000);
        continue;
      }

      if (paintResult?.painted === 1) {
        state.paintedCount++;
        state.lastPixel = {
          x: CONFIG.START_X + randomPos.x,
          y: CONFIG.START_Y + randomPos.y,
          time: new Date(),
        };
        state.charges.count--;

        document.getElementById("paintEffect").style.animation = "pulse 0.5s";
        setTimeout(() => {
          document.getElementById("paintEffect").style.animation = "";
        }, 500);

        updateUI(
          state.language === "pt" ? "✅ Pixel pintado!" : "✅ Pixel painted!",
          "success"
        );
      } else {
        updateUI(
          state.language === "pt" ? "❌ Falha ao pintar" : "❌ Failed to paint",
          "error"
        );
      }

      await sleep(CONFIG.DELAY);
      updateStats();
    }
  };

  const createUI = () => {
    if (state.menuOpen) return;
    state.menuOpen = true;

    const fontAwesome = document.createElement("link");
    fontAwesome.rel = "stylesheet";
    fontAwesome.href =
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
    document.head.appendChild(fontAwesome);

    const style = document.createElement("style");
    style.textContent = `
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0.7); }n
        70% { box-shadow: 0 0 0 10px rgba(0, 255, 0, 0); }
        100% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0); }
      }
      @keyframes slideIn {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .wplace-bot-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 250px;
        background: ${CONFIG.THEME.primary};
        border: 1px solid ${CONFIG.THEME.accent};
        border-radius: 8px;
        padding: 0;
        box-shadow: 0 5px 15px rgba(0,0,0,0.5);
        z-index: 9999;
        font-family: 'Segoe UI', Roboto, sans-serif;
        color: ${CONFIG.THEME.text};
        animation: slideIn 0.4s ease-out;
        overflow: hidden;
      }
      .wplace-header {
        padding: 12px 15px;
        background: ${CONFIG.THEME.secondary};
        color: ${CONFIG.THEME.highlight};
        font-size: 16px;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      }
      .wplace-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .wplace-header-controls {
        display: flex;
        gap: 10px;
      }
      .wplace-header-btn {
        background: none;
        border: none;
        color: ${CONFIG.THEME.text};
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
      }
      .wplace-header-btn:hover {
        opacity: 1;
      }
      .wplace-content {
        padding: 15px;
        display: ${state.minimized ? "none" : "block"};
      }
      .wplace-controls {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
      }
      .wplace-btn {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s;
      }
      .wplace-btn:hover {
        transform: translateY(-2px);
      }
      .wplace-btn-primary {
        background: ${CONFIG.THEME.accent};
        color: white;
      }
      .wplace-btn-stop {
        background: ${CONFIG.THEME.error};
        color: white;
      }
      .wplace-stats {
        background: ${CONFIG.THEME.secondary};
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 15px;
      }
      .wplace-stat-item {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 14px;
      }
      .wplace-stat-label {
        display: flex;
        align-items: center;
        gap: 6px;
        opacity: 0.8;
      }
      .wplace-status {
        padding: 8px;
        border-radius: 4px;
        text-align: center;
        font-size: 13px;
      }
      .status-default {
        background: rgba(255,255,255,0.1);
      }
      .status-success {
        background: rgba(0, 255, 0, 0.1);
        color: ${CONFIG.THEME.success};
      }
      .status-error {
        background: rgba(255, 0, 0, 0.1);
        color: ${CONFIG.THEME.error};
      }
      #paintEffect {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        border-radius: 8px;
      }
      .wplace-coordinates {
        background: ${CONFIG.THEME.secondary};
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 15px;
      }
      .wplace-coordinates-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        font-weight: 600;
        color: ${CONFIG.THEME.highlight};
      }
      .wplace-coordinate-capture {
        margin-bottom: 15px;
      }
      .wplace-coordinate-capture .wplace-btn {
        padding: 8px;
        font-size: 12px;
      }
    `;
    document.head.appendChild(style);

    const translations = {
      pt: {
        title: "WPlace Auto-Farm",
        start: "Iniciar",
        stop: "Parar",
        ready: "Pronto para começar",
        user: "Usuário",
        pixels: "Pixels",
        charges: "Cargas",
        level: "Level",
        captureLeftUpper: "Capturar Canto Superior Esquerdo",
        captureRightBottom: "Capturar Canto Inferior Direito",
        coordinateCapture: "Captura de Coordenadas",
        resetCoordinates: "Resetar Coordenadas",
        paintingArea: "Área de Pintura",
      },
      en: {
        title: "WPlace Auto-Farm",
        start: "Start",
        stop: "Stop",
        ready: "Ready to start",
        user: "User",
        pixels: "Pixels",
        charges: "Charges",
        level: "Level",
        captureLeftUpper: "Capture Left Upper Corner",
        captureRightBottom: "Capture Right Bottom Corner",
        coordinateCapture: "Coordinate Capture",
        resetCoordinates: "Reset Coordinates",
        paintingArea: "Painting Area",
      },
    };

    const t = translations[state.language] || translations.en;

    const panel = document.createElement("div");
    panel.className = "wplace-bot-panel";
    panel.innerHTML = `
      <div id="paintEffect"></div>
      <div class="wplace-header">
        <div class="wplace-header-title">
          <i class="fas fa-paint-brush"></i>
          <span>${t.title}</span>
        </div>
        <div class="wplace-header-controls">
          <button id="minimizeBtn" class="wplace-header-btn" title="${
            state.language === "pt" ? "Minimizar" : "Minimize"
          }">
            <i class="fas fa-${state.minimized ? "expand" : "minus"}"></i>
          </button>
        </div>
      </div>
      <div class="wplace-content">
        <div class="wplace-controls">
          <button id="toggleBtn" class="wplace-btn wplace-btn-primary">
            <i class="fas fa-play"></i>
            <span>${t.start}</span>
          </button>
          <label style="display:flex; align-items:center; margin-left:10px;">
            <input type="checkbox" id="autoRefreshCheckbox" ${
              state.autoRefresh ? "checked" : ""
            }/>
            <span style="margin-left:4px; font-size:14px;">Auto Refresh</span>
          </label>
        </div>
        
        <div class="wplace-coordinates">
          <div class="wplace-coordinates-header">
            <i class="fas fa-crosshairs"></i>
            <span>${t.coordinateCapture}</span>
          </div>
          
          <div class="wplace-coordinate-capture" style="margin-bottom: 15px;">
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <button id="captureLeftUpperBtn" class="wplace-btn" style="flex: 1; padding: 8px; font-size: 12px;">
                <i class="fas fa-arrow-up-left"></i>
                <span>${t.captureLeftUpper}</span>
              </button>
              <button id="captureRightBottomBtn" class="wplace-btn" style="flex: 1; padding: 8px; font-size: 12px;">
                <i class="fas fa-arrow-down-right"></i>
                <span>${t.captureRightBottom}</span>
              </button>
            </div>
            <button id="resetCoordinatesBtn" class="wplace-btn" style="width: 100%; padding: 8px; font-size: 12px;">
              <i class="fas fa-undo"></i>
              <span>${t.resetCoordinates}</span>
            </button>
          </div>
          
          <div id="coordinateInfo" style="text-align: center; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; font-size: 12px; opacity: 0.8;">
            ${
              state.capturedCoords.leftUpper && state.capturedCoords.rightBottom
                ? `${t.paintingArea}: X(${Math.min(
                    state.capturedCoords.leftUpper.x,
                    state.capturedCoords.rightBottom.x
                  )}-${Math.max(
                    state.capturedCoords.leftUpper.x,
                    state.capturedCoords.rightBottom.x
                  )}) Y(${Math.min(
                    state.capturedCoords.leftUpper.y,
                    state.capturedCoords.rightBottom.y
                  )}-${Math.max(
                    state.capturedCoords.leftUpper.y,
                    state.capturedCoords.rightBottom.y
                  )})`
                : "Default: Random 100x100 area"
            }
          </div>
        </div>
        
        <div class="wplace-stats">
          <div id="statsArea">
            <div class="wplace-stat-item">
              <div class="wplace-stat-label"><i class="fas fa-paint-brush"></i> ${
                state.language === "pt" ? "Carregando..." : "Loading..."
              }</div>
            </div>
          </div>
        </div>
        
        <div id="statusText" class="wplace-status status-default">
          ${t.ready}
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    const header = panel.querySelector(".wplace-header");
    let pos1 = 0,
      pos2 = 0,
      pos3 = 0,
      pos4 = 0;

    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      if (e.target.closest(".wplace-header-btn")) return;

      e = e || window.event;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      panel.style.top = panel.offsetTop - pos2 + "px";
      panel.style.left = panel.offsetLeft - pos1 + "px";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }

    const toggleBtn = panel.querySelector("#toggleBtn");
    const minimizeBtn = panel.querySelector("#minimizeBtn");
    const statusText = panel.querySelector("#statusText");
    const content = panel.querySelector(".wplace-content");
    const statsArea = panel.querySelector("#statsArea");

    toggleBtn.addEventListener("click", () => {
      state.running = !state.running;

      if (state.running && !capturedCaptchaToken) {
        updateUI(
          state.language === "pt"
            ? "❌ Token não capturado. Clique em qualquer pixel primeiro."
            : "❌ CAPTCHA token not captured. Please click any pixel manually first.",
          "error"
        );
        state.running = false;
        return;
      }

      if (state.running) {
        toggleBtn.innerHTML = `<i class="fas fa-stop"></i> <span>${t.stop}</span>`;
        toggleBtn.classList.remove("wplace-btn-primary");
        toggleBtn.classList.add("wplace-btn-stop");
        updateUI(
          state.language === "pt"
            ? "🚀 Pintura iniciada!"
            : "🚀 Painting started!",
          "success"
        );
        paintLoop();
      } else {
        toggleBtn.innerHTML = `<i class="fas fa-play"></i> <span>${t.start}</span>`;
        toggleBtn.classList.add("wplace-btn-primary");
        toggleBtn.classList.remove("wplace-btn-stop");
        statsArea.innerHTML = "";
        updateUI(
          state.language === "pt" ? "⏹️ Parado" : "⏹️ Stopped",
          "default"
        );
      }
    });

    minimizeBtn.addEventListener("click", () => {
      state.minimized = !state.minimized;
      content.style.display = state.minimized ? "none" : "block";
      minimizeBtn.innerHTML = `<i class="fas fa-${
        state.minimized ? "expand" : "minus"
      }"></i>`;
    });

    const autoRefreshCheckbox = panel.querySelector("#autoRefreshCheckbox");
    autoRefreshCheckbox.addEventListener("change", () => {
      state.autoRefresh = autoRefreshCheckbox.checked;
    });

    // Coordinate capture button event listeners
    const captureLeftUpperBtn = panel.querySelector("#captureLeftUpperBtn");
    const captureRightBottomBtn = panel.querySelector("#captureRightBottomBtn");
    const resetCoordinatesBtn = panel.querySelector("#resetCoordinatesBtn");

    captureLeftUpperBtn.addEventListener("click", () => {
      startCoordinateCapture("leftUpper");
    });

    captureRightBottomBtn.addEventListener("click", () => {
      startCoordinateCapture("rightBottom");
    });

    resetCoordinatesBtn.addEventListener("click", () => {
      resetCoordinates();
    });

    window.addEventListener("beforeunload", () => {
      state.menuOpen = false;
    });
  };

  window.updateUI = (message, type = "default") => {
    const statusText = document.querySelector("#statusText");
    if (statusText) {
      statusText.textContent = message;
      statusText.className = `wplace-status status-${type}`;
      statusText.style.animation = "none";
      void statusText.offsetWidth;
      statusText.style.animation = "slideIn 0.3s ease-out";
    }
  };

  window.updateStats = async () => {
    await getCharge();
    const statsArea = document.querySelector("#statsArea");
    if (statsArea) {
      const t = {
        pt: {
          user: "Usuário",
          pixels: "Pixels",
          charges: "Cargas",
          level: "Level",
        },
        en: {
          user: "User",
          pixels: "Pixels",
          charges: "Charges",
          level: "Level",
        },
      }[state.language] || {
        user: "User",
        pixels: "Pixels",
        charges: "Charges",
        level: "Level",
      };

      statsArea.innerHTML = `
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-user"></i> ${
            t.user
          }</div>
          <div>${state.userInfo.name}</div>
        </div>
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-paint-brush"></i> ${
            t.pixels
          }</div>
          <div>${state.paintedCount}</div>
        </div>
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-bolt"></i> ${
            t.charges
          }</div>
          <div>${Math.floor(state.charges.count)}/${Math.floor(
        state.charges.max
      )}</div>
        </div>
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-star"></i> ${
            t.level
          }</div>
          <div>${state.userInfo?.level || "0"}</div>
        </div>
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-crosshairs"></i> ${
            state.language === "pt" ? "Área de Pintura" : "Painting Area"
          }</div>
          <div>${
            state.capturedCoords.leftUpper && state.capturedCoords.rightBottom
              ? `X(${Math.min(
                  state.capturedCoords.leftUpper.x,
                  state.capturedCoords.rightBottom.x
                )}-${Math.max(
                  state.capturedCoords.leftUpper.x,
                  state.capturedCoords.rightBottom.x
                )}) Y(${Math.min(
                  state.capturedCoords.leftUpper.y,
                  state.capturedCoords.rightBottom.y
                )}-${Math.max(
                  state.capturedCoords.leftUpper.y,
                  state.capturedCoords.rightBottom.y
                )})`
              : "Default: Random 100x100"
          }</div>
        </div>
        ${
          state.capturedCoords.leftUpper || state.capturedCoords.rightBottom
            ? `
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-map-marker-alt"></i> ${
            state.language === "pt"
              ? "Coordenadas Capturadas"
              : "Captured Coordinates"
          }</div>
          <div style="font-size: 12px;">
            ${
              state.capturedCoords.leftUpper
                ? `LU: ${state.capturedCoords.leftUpper.x},${state.capturedCoords.leftUpper.y}`
                : ""
            }
            ${
              state.capturedCoords.leftUpper && state.capturedCoords.rightBottom
                ? "<br>"
                : ""
            }
            ${
              state.capturedCoords.rightBottom
                ? `RD: ${state.capturedCoords.rightBottom.x},${state.capturedCoords.rightBottom.y}`
                : ""
            }
          </div>
        </div>
        `
            : ""
        }
      `;
    }
  };

  await detectUserLocation();
  createUI();
  await getCharge();
  updateStats();
})();
