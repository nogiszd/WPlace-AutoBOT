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
    // New coordinate system state
    customCoords: false,
    topLeft: { x: CONFIG.START_X, y: CONFIG.START_Y },
    bottomRight: {
      x: CONFIG.START_X + CONFIG.PIXELS_PER_LINE - 1,
      y: CONFIG.START_Y + CONFIG.PIXELS_PER_LINE - 1,
    },
    selectingCoords: false,
    coordSelectionStep: 0, // 0: none, 1: selecting top-left, 2: selecting bottom-right
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
    if (state.customCoords) {
      // Use custom coordinate boundaries (absolute world coordinates)
      const minX = Math.min(state.topLeft.x, state.bottomRight.x);
      const maxX = Math.max(state.topLeft.x, state.bottomRight.x);
      const minY = Math.min(state.topLeft.y, state.bottomRight.y);
      const maxY = Math.max(state.topLeft.y, state.bottomRight.y);

      return {
        x: Math.floor(Math.random() * (maxX - minX + 1)) + minX,
        y: Math.floor(Math.random() * (maxY - minY + 1)) + minY,
      };
    } else {
      // Use default behavior (original 100x100 area)
      return {
        x: CONFIG.START_X + Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE),
        y: CONFIG.START_Y + Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE),
      };
    }
  };

  // Coordinate selection functions
  const startCoordinateSelection = () => {
    if (state.selectingCoords) return;

    state.selectingCoords = true;
    state.coordSelectionStep = 1;
    state.topLeft = { x: CONFIG.START_X, y: CONFIG.START_Y };
    state.bottomRight = {
      x: CONFIG.START_X + CONFIG.PIXELS_PER_LINE - 1,
      y: CONFIG.START_Y + CONFIG.PIXELS_PER_LINE - 1,
    };

    const message =
      state.language === "pt"
        ? "🎯 Clique no canto superior esquerdo da área desejada..."
        : "🎯 Click on the top-left corner of the desired area...";

    updateUI(message, "status");
    showCoordinateSelectionStatus(message);

    // Enable canvas click detection
    enableCanvasClickDetection();

    // Add timeout for coordinate selection (2 minutes)
    state.coordSelectionTimeout = setTimeout(() => {
      if (state.selectingCoords) {
        const timeoutMessage =
          state.language === "pt"
            ? "⏰ Tempo esgotado para seleção de coordenadas"
            : "⏰ Timeout for coordinate selection";
        updateUI(timeoutMessage, "error");
        cancelCoordinateSelection();
      }
    }, 120000);
  };

  const enableCanvasClickDetection = () => {
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      const errorMessage =
        state.language === "pt"
          ? "❌ Canvas não encontrado. Abra a página de pintura primeiro."
          : "❌ Canvas not found. Please open the paint page first.";

      updateUI(errorMessage, "error");
      hideCoordinateSelectionStatus();
      state.selectingCoords = false;
      state.coordSelectionStep = 0;
      return;
    }

    // Check if canvas is visible and has proper dimensions
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      const errorMessage =
        state.language === "pt"
          ? "❌ Canvas não está visível ou não tem dimensões válidas"
          : "❌ Canvas is not visible or has invalid dimensions";

      updateUI(errorMessage, "error");
      hideCoordinateSelectionStatus();
      state.selectingCoords = false;
      state.coordSelectionStep = 0;
      return;
    }

    const handleCanvasClick = (e) => {
      if (!state.selectingCoords) return;

      const rect = canvas.getBoundingClientRect();
      const canvasX = Math.floor(
        (e.clientX - rect.left) / (rect.width / CONFIG.PIXELS_PER_LINE)
      );
      const canvasY = Math.floor(
        (e.clientY - rect.top) / (rect.height / CONFIG.PIXELS_PER_LINE)
      );

      // Clamp canvas coordinates to valid range (0-99)
      const clampedCanvasX = Math.max(
        0,
        Math.min(CONFIG.PIXELS_PER_LINE - 1, canvasX)
      );
      const clampedCanvasY = Math.max(
        0,
        Math.min(CONFIG.PIXELS_PER_LINE - 1, canvasY)
      );

      // Convert canvas coordinates to absolute world coordinates
      const worldX = CONFIG.START_X + clampedCanvasX;
      const worldY = CONFIG.START_Y + clampedCanvasY;

      if (state.coordSelectionStep === 1) {
        // Selecting top-left corner
        state.topLeft = { x: worldX, y: worldY };
        state.coordSelectionStep = 2;

        const message =
          state.language === "pt"
            ? `📍 Canto superior esquerdo definido em (${worldX}, ${worldY}). Agora clique no canto inferior direito...`
            : `📍 Top-left corner set at (${worldX}, ${worldY}). Now click on the bottom-right corner...`;

        updateUI(message, "status");
        showCoordinateSelectionStatus(message);
      } else if (state.coordSelectionStep === 2) {
        // Selecting bottom-right corner
        state.bottomRight = { x: worldX, y: worldY };
        state.coordSelectionStep = 0;
        state.selectingCoords = false;
        state.customCoords = true;

        // Clear timeout
        if (state.coordSelectionTimeout) {
          clearTimeout(state.coordSelectionTimeout);
          state.coordSelectionTimeout = null;
        }

        // Ensure proper ordering
        if (state.topLeft.x > state.bottomRight.x) {
          [state.topLeft.x, state.bottomRight.x] = [
            state.bottomRight.x,
            state.topLeft.x,
          ];
        }
        if (state.topLeft.y > state.bottomRight.y) {
          [state.topLeft.y, state.bottomRight.y] = [
            state.bottomRight.y,
            state.topLeft.y,
          ];
        }

        // Check if the selected area is too small
        const areaWidth = state.bottomRight.x - state.topLeft.x + 1;
        const areaHeight = state.bottomRight.y - state.topLeft.y + 1;
        if (areaWidth < 5 || areaHeight < 5) {
          const warningMessage =
            state.language === "pt"
              ? "⚠️ Área selecionada é muito pequena. Considere selecionar uma área maior."
              : "⚠️ Selected area is very small. Consider selecting a larger area.";
          updateUI(warningMessage, "warning");
        }

        const successMessage =
          state.language === "pt"
            ? `✅ Área definida: (${state.topLeft.x}, ${state.topLeft.y}) até (${state.bottomRight.x}, ${state.bottomRight.y})`
            : `✅ Area defined: (${state.topLeft.x}, ${state.topLeft.y}) to (${state.bottomRight.x}, ${state.bottomRight.y})`;

        updateUI(successMessage, "success");
        hideCoordinateSelectionStatus();

        // Remove click listener
        canvas.removeEventListener("click", handleCanvasClick);

        // Save preferences and update UI
        saveCoordinatePreferences();
        updateCoordinateUI();
      }
    };

    canvas.addEventListener("click", handleCanvasClick);

    // Add visual feedback
    canvas.style.cursor = "crosshair";
    canvas.style.border = "2px solid #00ff00";
  };

  const resetCoordinates = () => {
    state.customCoords = false;
    state.topLeft = { x: CONFIG.START_X, y: CONFIG.START_Y };
    state.bottomRight = {
      x: CONFIG.START_X + CONFIG.PIXELS_PER_LINE - 1,
      y: CONFIG.START_Y + CONFIG.PIXELS_PER_LINE - 1,
    };
    state.selectingCoords = false;
    state.coordSelectionStep = 0;

    // Clear timeout if it exists
    if (state.coordSelectionTimeout) {
      clearTimeout(state.coordSelectionTimeout);
      state.coordSelectionTimeout = null;
    }

    // Reset canvas styling
    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.style.cursor = "";
      canvas.style.border = "";
    }

    const message =
      state.language === "pt"
        ? "🔄 Coordenadas resetadas para o comportamento padrão"
        : "🔄 Coordinates reset to default behavior";

    updateUI(message, "default");
    hideCoordinateSelectionStatus();

    // Save preferences and update UI
    saveCoordinatePreferences();
    updateCoordinateUI();
  };

  const cancelCoordinateSelection = () => {
    if (!state.selectingCoords) return;

    state.selectingCoords = false;
    state.coordSelectionStep = 0;

    // Clear timeout if it exists
    if (state.coordSelectionTimeout) {
      clearTimeout(state.coordSelectionTimeout);
      state.coordSelectionTimeout = null;
    }

    // Reset canvas styling
    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.style.cursor = "";
      canvas.style.border = "";
    }

    const message =
      state.language === "pt"
        ? "❌ Seleção de coordenadas cancelada"
        : "❌ Coordinate selection cancelled";

    updateUI(message, "default");
    hideCoordinateSelectionStatus();
  };

  // Add escape key listener for coordinate selection
  const addEscapeKeyListener = () => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && state.selectingCoords) {
        cancelCoordinateSelection();
      }
    };
    document.addEventListener("keydown", handleEscape);

    // Return cleanup function
    return () => document.removeEventListener("keydown", handleEscape);
  };

  // Show/hide coordinate selection status
  const showCoordinateSelectionStatus = (message) => {
    const statusDiv = document.querySelector("#coordSelectionStatus");
    const textSpan = document.querySelector("#coordSelectionText");
    if (statusDiv && textSpan) {
      textSpan.textContent = message;
      statusDiv.style.display = "block";
    }
  };

  const hideCoordinateSelectionStatus = () => {
    const statusDiv = document.querySelector("#coordSelectionStatus");
    if (statusDiv) {
      statusDiv.style.display = "none";
    }
  };

  const updateCoordinateUI = () => {
    const coordInfo = document.querySelector("#coordInfo");
    if (coordInfo) {
      if (state.customCoords) {
        coordInfo.className = "wplace-coord-info custom";
        coordInfo.innerHTML = `
          <div class="wplace-stat-item">
            <div class="wplace-stat-label">
              <i class="fas fa-map-marker-alt"></i> 
              ${state.language === "pt" ? "Área Personalizada" : "Custom Area"}
            </div>
            <div style="font-size: 12px; opacity: 0.8;">
              (${state.topLeft.x}, ${state.topLeft.y}) → (${
          state.bottomRight.x
        }, ${state.bottomRight.y})
            </div>
          </div>
        `;
      } else {
        coordInfo.className = "wplace-coord-info";
        coordInfo.innerHTML = `
          <div class="wplace-stat-item">
            <div class="wplace-stat-label">
              <i class="fas fa-globe"></i> 
              ${state.language === "pt" ? "Área Padrão" : "Default Area"}
            </div>
            <div style="font-size: 12px; opacity: 0.8;">
              ${CONFIG.START_X},${CONFIG.START_Y} → ${
          CONFIG.START_X + CONFIG.PIXELS_PER_LINE - 1
        },${CONFIG.START_Y + CONFIG.PIXELS_PER_LINE - 1}
            </div>
          </div>
        `;
      }
    }
  };

  // Save and load coordinate preferences
  const saveCoordinatePreferences = () => {
    try {
      const preferences = {
        customCoords: state.customCoords,
        topLeft: state.topLeft,
        bottomRight: state.bottomRight,
      };
      localStorage.setItem("wplace-farm-coords", JSON.stringify(preferences));
    } catch (e) {
      console.warn("Failed to save coordinate preferences:", e);
    }
  };

  const loadCoordinatePreferences = () => {
    try {
      const saved = localStorage.getItem("wplace-farm-coords");
      if (saved) {
        const preferences = JSON.parse(saved);
        if (
          preferences.customCoords &&
          preferences.topLeft &&
          preferences.bottomRight
        ) {
          // Validate coordinates are within reasonable bounds
          const minValidX = CONFIG.START_X - 1000; // Allow some flexibility
          const maxValidX = CONFIG.START_X + 1000;
          const minValidY = CONFIG.START_Y - 1000;
          const maxValidY = CONFIG.START_Y + 1000;

          if (
            preferences.topLeft.x >= minValidX &&
            preferences.topLeft.x <= maxValidX &&
            preferences.topLeft.y >= minValidY &&
            preferences.topLeft.y <= maxValidY &&
            preferences.bottomRight.x >= minValidX &&
            preferences.bottomRight.x <= maxValidX &&
            preferences.bottomRight.y >= minValidY &&
            preferences.bottomRight.y <= maxValidY
          ) {
            state.customCoords = preferences.customCoords;
            state.topLeft = preferences.topLeft;
            state.bottomRight = preferences.bottomRight;

            // Ensure proper ordering
            if (state.topLeft.x > state.bottomRight.x) {
              [state.topLeft.x, state.bottomRight.x] = [
                state.bottomRight.x,
                state.topLeft.x,
              ];
            }
            if (state.topLeft.y > state.bottomRight.y) {
              [state.topLeft.y, state.bottomRight.y] = [
                state.bottomRight.y,
                state.topLeft.y,
              ];
            }
          } else {
            console.warn("Saved coordinates are out of bounds, using defaults");
            // Reset to defaults if coordinates are invalid
            state.customCoords = false;
            state.topLeft = { x: CONFIG.START_X, y: CONFIG.START_Y };
            state.bottomRight = {
              x: CONFIG.START_X + CONFIG.PIXELS_PER_LINE - 1,
              y: CONFIG.START_Y + CONFIG.PIXELS_PER_LINE - 1,
            };
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load coordinate preferences:", e);
      // Reset to defaults on error
      state.customCoords = false;
      state.topLeft = { x: CONFIG.START_X, y: CONFIG.START_Y };
      state.bottomRight = {
        x: CONFIG.START_X + CONFIG.PIXELS_PER_LINE - 1,
        y: CONFIG.START_Y + CONFIG.PIXELS_PER_LINE - 1,
      };
    }
  };

  // Enhanced coordinate validation
  const validateCoordinates = (x, y) => {
    if (state.customCoords) {
      return (
        x >= state.topLeft.x &&
        x <= state.bottomRight.x &&
        y >= state.topLeft.y &&
        y <= state.bottomRight.y
      );
    }
    return (
      x >= 0 &&
      x < CONFIG.PIXELS_PER_LINE &&
      y >= 0 &&
      y < CONFIG.PIXELS_PER_LINE
    );
  };

  const paintPixel = async (x, y) => {
    const randomColor = Math.floor(Math.random() * 31) + 1;

    // x and y are now absolute world coordinates
    const absX = x;
    const absY = y;

    // Calculate which region this pixel belongs to (regions are 1000x1000)
    const regionX = Math.floor(absX / 1000);
    const regionY = Math.floor(absY / 1000);

    // Calculate pixel position within the region (0-999)
    const pixelX = absX % 1000;
    const pixelY = absY % 1000;

    const url = `https://backend.wplace.live/s0/pixel/${regionX}/${regionY}`;
    const payload = JSON.stringify({
      coords: [pixelX, pixelY],
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
      .wplace-coord-controls {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
      }
      .wplace-coord-info {
        background: ${CONFIG.THEME.secondary};
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 10px;
        border-left: 3px solid ${CONFIG.THEME.highlight};
      }
      .wplace-coord-info.custom {
        border-left-color: ${CONFIG.THEME.success};
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
        
        <div class="wplace-controls" style="margin-bottom: 10px;">
          <button id="selectCoordsBtn" class="wplace-btn wplace-btn-primary" style="flex: 0.6;">
            <i class="fas fa-crosshairs"></i>
            <span>${
              state.language === "pt" ? "Selecionar Área" : "Select Area"
            }</span>
          </button>
          <button id="resetCoordsBtn" class="wplace-btn wplace-btn-stop" style="flex: 0.4;">
            <i class="fas fa-undo"></i>
            <span>${state.language === "pt" ? "Reset" : "Reset"}</span>
          </button>
        </div>
        
        <div id="coordSelectionStatus" style="display: none; margin-bottom: 10px; padding: 8px; background: rgba(255, 255, 0, 0.1); border-radius: 4px; text-align: center; font-size: 12px; color: #ffcc00;">
          <i class="fas fa-clock"></i> 
          <span id="coordSelectionText">${
            state.language === "pt"
              ? "Selecionando coordenadas..."
              : "Selecting coordinates..."
          }</span>
        </div>
        
        <div id="coordInfo" class="wplace-coord-info">
          <div class="wplace-stat-item">
            <div class="wplace-stat-label">
              <i class="fas fa-globe"></i> 
              ${state.language === "pt" ? "Área Padrão" : "Default Area"}
            </div>
            <div style="font-size: 12px; opacity: 0.8;">
              ${CONFIG.START_X},${CONFIG.START_Y} → ${
      CONFIG.START_X + CONFIG.PIXELS_PER_LINE - 1
    },${CONFIG.START_Y + CONFIG.PIXELS_PER_LINE - 1}
            </div>
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
    const selectCoordsBtn = panel.querySelector("#selectCoordsBtn");
    const resetCoordsBtn = panel.querySelector("#resetCoordsBtn");
    const coordSelectionStatus = panel.querySelector("#coordSelectionStatus");
    const coordSelectionText = panel.querySelector("#coordSelectionText");

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

        // Show coordinate area info if custom coordinates are set
        if (state.customCoords) {
          const areaInfo =
            state.language === "pt"
              ? ` (Área: ${state.topLeft.x},${state.topLeft.y} → ${state.bottomRight.x},${state.bottomRight.y})`
              : ` (Area: ${state.topLeft.x},${state.topLeft.y} → ${state.bottomRight.x},${state.bottomRight.y})`;
          updateUI(
            (state.language === "pt"
              ? "🚀 Pintura iniciada!"
              : "🚀 Painting started!") + areaInfo,
            "success"
          );
        }

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

    // Coordinate control button event listeners
    selectCoordsBtn.addEventListener("click", () => {
      if (state.running) {
        updateUI(
          state.language === "pt"
            ? "❌ Pare a pintura antes de selecionar coordenadas"
            : "❌ Stop painting before selecting coordinates",
          "error"
        );
        return;
      }
      startCoordinateSelection();
    });

    resetCoordsBtn.addEventListener("click", () => {
      if (state.running) {
        updateUI(
          state.language === "pt"
            ? "❌ Pare a pintura antes de resetar coordenadas"
            : "❌ Stop painting before resetting coordinates",
          "error"
        );
        return;
      }
      resetCoordinates();
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
          area: "Área Ativa",
        },
        en: {
          user: "User",
          pixels: "Pixels",
          charges: "Charges",
          level: "Level",
          area: "Active Area",
        },
      }[state.language] || {
        user: "User",
        pixels: "Pixels",
        charges: "Charges",
        level: "Level",
        area: "Active Area",
      };

      let areaInfo = "";
      if (state.customCoords) {
        areaInfo = `
          <div class="wplace-stat-item">
            <div class="wplace-stat-label"><i class="fas fa-map-marker-alt"></i> ${t.area}</div>
            <div style="font-size: 12px; opacity: 0.8;">
              (${state.topLeft.x}, ${state.topLeft.y}) → (${state.bottomRight.x}, ${state.bottomRight.y})
            </div>
          </div>
        `;
      }

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
        ${areaInfo}
      `;
    }
  };

  await detectUserLocation();
  createUI();
  await getCharge();
  updateStats();

  // Load coordinate preferences and update UI
  loadCoordinatePreferences();
  updateCoordinateUI();
})();
