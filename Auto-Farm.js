(async () => {
  const CONFIG = {
    START_X: 742,
    START_Y: 1148,
    PIXELS_PER_LINE: 100,
    DELAY: 1000,
    // Boundary controls for pixel placement
    BOUNDARIES: {
      MIN_X: 0,
      MAX_X: 99,
      MIN_Y: 0,
      MAX_Y: 99,
    },
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
    // Boundary state
    boundaries: {
      minX: CONFIG.BOUNDARIES.MIN_X,
      maxX: CONFIG.BOUNDARIES.MAX_X,
      minY: CONFIG.BOUNDARIES.MIN_Y,
      maxY: CONFIG.BOUNDARIES.MAX_Y,
    },
    useCustomBoundaries: false,
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
    if (state.useCustomBoundaries) {
      return {
        x:
          Math.floor(
            Math.random() * (state.boundaries.maxX - state.boundaries.minX + 1)
          ) + state.boundaries.minX,
        y:
          Math.floor(
            Math.random() * (state.boundaries.maxY - state.boundaries.minY + 1)
          ) + state.boundaries.minY,
      };
    } else {
      // Use default boundaries (full canvas)
      return {
        x: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE),
        y: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE),
      };
    }
  };

  const updateBoundaries = (minX, maxX, minY, maxY) => {
    // Validate boundaries
    const validMinX = Math.max(0, Math.min(minX, CONFIG.PIXELS_PER_LINE - 1));
    const validMaxX = Math.max(
      validMinX + 1,
      Math.min(maxX, CONFIG.PIXELS_PER_LINE - 1)
    );
    const validMinY = Math.max(0, Math.min(minY, CONFIG.PIXELS_PER_LINE - 1));
    const validMaxY = Math.max(
      validMinY + 1,
      Math.min(maxY, CONFIG.PIXELS_PER_LINE - 1)
    );

    state.boundaries = {
      minX: validMinX,
      maxX: validMaxX,
      minY: validMinY,
      maxY: validMaxY,
    };

    return state.boundaries;
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
      .wplace-boundaries {
        background: ${CONFIG.THEME.secondary};
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 15px;
      }
      .wplace-boundaries-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        font-weight: 600;
        color: ${CONFIG.THEME.highlight};
      }
      .wplace-boundaries-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 10px;
      }
      .wplace-boundary-input {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .wplace-boundary-input label {
        font-size: 12px;
        opacity: 0.8;
        font-weight: 500;
      }
      .wplace-boundary-input input {
        padding: 6px 8px;
        border: 1px solid ${CONFIG.THEME.accent};
        border-radius: 4px;
        background: ${CONFIG.THEME.primary};
        color: ${CONFIG.THEME.text};
        font-size: 12px;
        width: 100%;
      }
      .wplace-boundary-input input:focus {
        outline: none;
        border-color: ${CONFIG.THEME.highlight};
      }
      .wplace-boundaries-controls {
        display: flex;
        gap: 8px;
      }
      .wplace-boundaries-controls .wplace-btn {
        flex: 1;
        padding: 8px;
        font-size: 12px;
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
        boundaries: "Limites",
        customBoundaries: "Limites Personalizados",
        defaultBoundaries: "Limites Padrão",
        minX: "Min X",
        maxX: "Max X",
        minY: "Min Y",
        maxY: "Max Y",
        apply: "Aplicar",
        reset: "Reset",
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
        boundaries: "Boundaries",
        customBoundaries: "Custom Boundaries",
        defaultBoundaries: "Default Boundaries",
        minX: "Min X",
        maxX: "Max X",
        minY: "Min Y",
        maxY: "Max Y",
        apply: "Apply",
        reset: "Reset",
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
        
                 <div class="wplace-boundaries">
           <div class="wplace-boundaries-header">
             <i class="fas fa-crop-alt"></i>
             <span>${t.boundaries}</span>
           </div>
           
           <div class="wplace-boundaries-toggle" style="margin-bottom: 12px;">
             <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
               <input type="checkbox" id="customBoundariesCheckbox" ${
                 state.useCustomBoundaries ? "checked" : ""
               } style="margin: 0;">
               <span style="font-size: 13px; font-weight: 500;">${
                 t.customBoundaries
               }</span>
             </label>
           </div>
           
           <div id="boundaryInputs" class="wplace-boundaries-grid" style="display: ${
             state.useCustomBoundaries ? "grid" : "none"
           };">
             <div class="wplace-boundary-input">
               <label>${t.minX}</label>
               <input type="number" id="minXInput" min="0" max="99" value="${
                 state.boundaries.minX
               }">
             </div>
             <div class="wplace-boundary-input">
               <label>${t.maxX}</label>
               <input type="number" id="maxXInput" min="0" max="99" value="${
                 state.boundaries.maxX
               }">
             </div>
             <div class="wplace-boundary-input">
               <label>${t.minY}</label>
               <input type="number" id="minYInput" min="0" max="99" value="${
                 state.boundaries.minY
               }">
             </div>
             <div class="wplace-boundary-input">
               <label>${t.maxY}</label>
               <input type="number" id="maxYInput" min="0" max="99" value="${
                 state.boundaries.maxY
               }">
             </div>
           </div>
           
           <div id="boundaryControls" class="wplace-boundaries-controls" style="display: ${
             state.useCustomBoundaries ? "flex" : "none"
           };">
             <button id="applyBoundariesBtn" class="wplace-btn wplace-btn-primary">
               <i class="fas fa-check"></i>
               <span>${t.apply}</span>
             </button>
             <button id="resetBoundariesBtn" class="wplace-btn">
               <i class="fas fa-undo"></i>
               <span>${t.reset}</span>
             </button>
           </div>
           
           <div id="defaultBoundariesInfo" style="display: ${
             state.useCustomBoundaries ? "none" : "block"
           }; text-align: center; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; font-size: 12px; opacity: 0.8;">
             ${t.defaultBoundaries}: X(0-99) Y(0-99)
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

    // Custom boundaries checkbox event listener
    const customBoundariesCheckbox = panel.querySelector(
      "#customBoundariesCheckbox"
    );
    const boundaryInputs = panel.querySelector("#boundaryInputs");
    const boundaryControls = panel.querySelector("#boundaryControls");
    const defaultBoundariesInfo = panel.querySelector("#defaultBoundariesInfo");

    customBoundariesCheckbox.addEventListener("change", () => {
      state.useCustomBoundaries = customBoundariesCheckbox.checked;

      if (state.useCustomBoundaries) {
        boundaryInputs.style.display = "grid";
        boundaryControls.style.display = "flex";
        defaultBoundariesInfo.style.display = "none";
      } else {
        boundaryInputs.style.display = "none";
        boundaryControls.style.display = "none";
        defaultBoundariesInfo.style.display = "block";
        // Reset to default boundaries when unchecking
        updateBoundaries(
          CONFIG.BOUNDARIES.MIN_X,
          CONFIG.BOUNDARIES.MAX_X,
          CONFIG.BOUNDARIES.MIN_Y,
          CONFIG.BOUNDARIES.MAX_Y
        );
      }
    });

    // Boundary controls event listeners
    const minXInput = panel.querySelector("#minXInput");
    const maxXInput = panel.querySelector("#maxXInput");
    const minYInput = panel.querySelector("#minYInput");
    const maxYInput = panel.querySelector("#maxYInput");
    const applyBoundariesBtn = panel.querySelector("#applyBoundariesBtn");
    const resetBoundariesBtn = panel.querySelector("#resetBoundariesBtn");

    applyBoundariesBtn.addEventListener("click", () => {
      const minX = parseInt(minXInput.value) || 0;
      const maxX = parseInt(maxXInput.value) || 99;
      const minY = parseInt(minYInput.value) || 0;
      const maxY = parseInt(maxYInput.value) || 99;

      const newBoundaries = updateBoundaries(minX, maxX, minY, maxY);

      // Update input values to reflect validated boundaries
      minXInput.value = newBoundaries.minX;
      maxXInput.value = newBoundaries.maxX;
      minYInput.value = newBoundaries.minY;
      maxYInput.value = newBoundaries.maxY;

      const message =
        state.language === "pt"
          ? `✅ Limites atualizados: X(${newBoundaries.minX}-${newBoundaries.maxX}) Y(${newBoundaries.minY}-${newBoundaries.maxY})`
          : `✅ Boundaries updated: X(${newBoundaries.minX}-${newBoundaries.maxX}) Y(${newBoundaries.minY}-${newBoundaries.maxY})`;

      updateUI(message, "success");
    });

    resetBoundariesBtn.addEventListener("click", () => {
      const defaultBoundaries = updateBoundaries(
        CONFIG.BOUNDARIES.MIN_X,
        CONFIG.BOUNDARIES.MAX_X,
        CONFIG.BOUNDARIES.MIN_Y,
        CONFIG.BOUNDARIES.MAX_Y
      );

      minXInput.value = defaultBoundaries.minX;
      maxXInput.value = defaultBoundaries.maxX;
      minYInput.value = defaultBoundaries.minY;
      maxYInput.value = defaultBoundaries.maxY;

      const message =
        state.language === "pt"
          ? "🔄 Limites resetados para padrão"
          : "🔄 Boundaries reset to default";

      updateUI(message, "default");
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
          boundaries: "Limites",
        },
        en: {
          user: "User",
          pixels: "Pixels",
          charges: "Charges",
          level: "Level",
          boundaries: "Boundaries",
        },
      }[state.language] || {
        user: "User",
        pixels: "Pixels",
        charges: "Charges",
        level: "Level",
        boundaries: "Boundaries",
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
          <div class="wplace-stat-label"><i class="fas fa-crop-alt"></i> ${
            t.boundaries
          }</div>
          <div>${
            state.useCustomBoundaries
              ? `X:${state.boundaries.minX}-${state.boundaries.maxX} Y:${state.boundaries.minY}-${state.boundaries.maxY}`
              : "Default (0-99, 0-99)"
          }</div>
        </div>
      `;
    }
  };

  await detectUserLocation();
  createUI();
  await getCharge();
  updateStats();
})();
