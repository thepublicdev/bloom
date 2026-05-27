const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  dialog,
  session,
  shell,
  Tray,
  Menu,
  screen,
} = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const Mixpanel = require('mixpanel');

// Initialize Mixpanel for Node.js (main process)
const mixpanel = Mixpanel.init('6506b5250de6efccb495adaee0d8862d', {
    debug: !app.isPackaged, // true in development, false in production
    geolocate: true,
});

// Get app metadata for analytics
function getAppMetadata() {
    return {
        app_name: app.getName(),
        app_version: app.getVersion(),
        electron_version: process.versions.electron,
        chrome_version: process.versions.chrome,
        node_version: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        os_type: os.type(),
        os_release: os.release(),
        locale: app.getLocale(),
    };
}

// Enhanced tracking function with automatic metadata
function trackEvent(eventName, properties = {}) {
    const metadata = getAppMetadata();
    const combinedProperties = {
        ...metadata,
        ...properties
    };
    mixpanel.track(eventName, combinedProperties);
}

let overlayWin;
let controlWin;
let settingsWin = null;
let tray = null;
let lastRecordingPath = null;

// Config persistence
function getConfigPath() {
  return path.join(app.getPath('userData'), 'bloom-config.json');
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

function createWindows() {
  // Set up display media request handler for screen recording
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => {
          // Grant access to the first screen found.
          callback({ video: sources[0], audio: "loopback" });
        })
        .catch((err) => {
          console.error("Error getting screen sources:", err);
          callback({});
        });
    },
    { useSystemPicker: true }
  );

  // initial overlay window size & position
  const startW = 320;
  const startH = 320;
  const startX = 100;
  const startY = 100;

  overlayWin = new BrowserWindow({
    x: startX,
    y: startY,
    width: startW,
    height: startH,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: false,
      webSecurity: false,
    },
  });

  // small clickable control window pinned to right edge, vertically centred
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const stripW = 72;
  const stripH = 436;
  const stripX = sw - stripW - 16;
  const stripY = Math.round((sh - stripH) / 2);

  controlWin = new BrowserWindow({
    x: stripX,
    y: stripY,
    width: stripW,
    height: stripH,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: false,
      webSecurity: false,
    },
  });

  // Make sure control window stays above overlay
  controlWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setAlwaysOnTop(true, "floating");

  overlayWin.loadFile("index.html");
  controlWin.loadFile("controls.html");

  // Start in "unlocked" mode (draggable) - changed from locked
  overlayWin.setIgnoreMouseEvents(false);

  // After renderer loads, send initial lock state so UI can reflect it
  overlayWin.webContents.once("did-finish-load", () => {
    overlayWin.webContents.send("lock-changed", false);
    // Auto-start camera with default device (null = let renderer pick default)
    overlayWin.webContents.send("start-camera", null);
  });
  controlWin.webContents.once("did-finish-load", () => {
    controlWin.webContents.send("lock-changed", false);
  });

  // Move overlay window (called from overlay renderer during dragging)
  ipcMain.on("move-window", (_, x, y) => {
    overlayWin.setPosition(Math.round(x), Math.round(y));
  });

  // Resize overlay window (called from controls when using preset sizes)
  ipcMain.on("resize-overlay", (_, w, h) => {
    overlayWin.setResizable(true);
    overlayWin.setSize(Math.round(w), Math.round(h));
    overlayWin.setResizable(false);
  });

  // Lock toggle from control window
  ipcMain.on("set-lock", (_, locked) => {
    trackEvent("lock-changed", { locked: !!locked });
    // locked === true -> make overlay click-through
    overlayWin.setIgnoreMouseEvents(!!locked, { forward: true });
    // broadcast new lock state to renderers
    overlayWin.webContents.send("lock-changed", !!locked);
    controlWin.webContents.send("lock-changed", !!locked);
  });

  // Start overlay with selected camera
  ipcMain.on("start-overlay", (_, cameraId) => {
    overlayWin.webContents.send("start-camera", cameraId);
    controlWin.webContents.send("overlay-status", true);
    trackEvent("start-overlay", { camera_id: cameraId });
  });

  // Stop overlay
  ipcMain.on("stop-overlay", () => {
    overlayWin.webContents.send("stop-camera");
    controlWin.webContents.send("overlay-status", false);
    trackEvent("stop-overlay");
  });

  // Start screen recording
  ipcMain.on("start-recording", async () => {
    try {
      // Send recording command to overlay window (which has access to desktopCapturer)
      overlayWin.webContents.send("start-screen-recording");
      controlWin.webContents.send("recording-status", true);
      trackEvent("start-recording");
    } catch (err) {
      console.error("Error starting recording:", err);
      controlWin.webContents.send("recording-error", err.message);
    }
  });

  // Stop screen recording
  ipcMain.on("stop-recording", () => {
    overlayWin.webContents.send("stop-screen-recording");
    controlWin.webContents.send("recording-status", false);
    trackEvent("stop-recording");
  });

  // Handle when recording is ended by user via system controls
  ipcMain.on("recording-ended-by-user", () => {
    controlWin.webContents.send("recording-status", false);
    controlWin.webContents.send("recording-ended-by-user");
    trackEvent("recording-ended-by-user");
  });

  // Handle recording errors from renderer
  ipcMain.on("recording-error", (_, error) => {
    controlWin.webContents.send("recording-error", error);
    trackEvent("recording-error", { error });
  });

  // Handle recording file saved notification
  ipcMain.on("recording-saved", (_, filePath) => {
    controlWin.webContents.send("recording-saved", filePath);
    trackEvent("recording-saved", { filePath });
  });

  // Save recording file
  ipcMain.on("save-recording", async (_, data) => {
    try {
      const { buffer, filename } = data;

      // Save to configured folder or Desktop by default
      const config = loadConfig();
      const desktopPath = config.saveFolder || path.join(os.homedir(), "Desktop");
      const filePath = path.join(desktopPath, filename);

      // Convert array back to Buffer
      const fileBuffer = Buffer.from(buffer);

      // Write file
      fs.writeFileSync(filePath, fileBuffer);

      console.log(`Recording saved to: ${filePath}`);

      // Store the last recording path
      lastRecordingPath = filePath;

      // Notify control window
      controlWin.webContents.send("recording-saved", filePath);
      trackEvent("recording-saved", { filePath });
    } catch (err) {
      console.error("Error saving recording file:", err);
      controlWin.webContents.send("recording-error", err.message);
    }
  });

  // Open recordings folder
  ipcMain.on("open-recordings-folder", () => {
    const desktopPath = path.join(os.homedir(), "Desktop");
    trackEvent("open-recordings-folder");
    shell.openPath(desktopPath);
  });

  // Open last recorded file in browser
  ipcMain.on("open-recorded-file", () => {
    if (lastRecordingPath && fs.existsSync(lastRecordingPath)) {
      trackEvent("open-recorded-file", { filePath: lastRecordingPath });
      shell.openPath(lastRecordingPath);
    } else {
      // Fallback to opening the recordings folder if no specific file
      const desktopPath = path.join(os.homedir(), "Desktop");
      shell.openPath(desktopPath);
    }
  });

  // Set shape on overlay
  ipcMain.on("set-shape", (_, shape) => {
    overlayWin.webContents.send("set-shape", shape);
    trackEvent("set-shape", { shape });
  });

  // Set size on overlay
  ipcMain.on("set-size", (_, size) => {
    overlayWin.webContents.send("set-size", size);
    trackEvent("set-size", { size });
  });

  // Get configured save folder
  ipcMain.on("get-save-folder", (event) => {
    const config = loadConfig();
    const folder = config.saveFolder || path.join(os.homedir(), 'Desktop');
    event.sender.send("save-folder-chosen", folder);
  });

  // Choose save folder via dialog
  ipcMain.on("choose-save-folder", async (event) => {
    const parent = (settingsWin && !settingsWin.isDestroyed()) ? settingsWin : controlWin;
    const result = await dialog.showOpenDialog(parent, {
      properties: ['openDirectory'],
      title: 'Choose save location for recordings',
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const folder = result.filePaths[0];
      event.sender.send("save-folder-chosen", folder);
      trackEvent("save-folder-browsed", { folder });
    }
  });

  // Mic selection (handled in renderer; stored for recording use)
  ipcMain.on("start-mic", (_, micId) => {
    trackEvent("mic-selected", { mic_id: micId });
  });

  ipcMain.on("stop-mic", () => {
    trackEvent("mic-stopped");
  });

  // Expand control strip to show device popup
  ipcMain.on("show-device-popup", () => {
    const { width: sw } = screen.getPrimaryDisplay().workAreaSize;
    const expandedW = 320;
    const stripY = controlWin.getBounds().y;
    const expandedX = sw - expandedW - 16;
    controlWin.setResizable(true);
    controlWin.setBounds({ x: expandedX, y: stripY, width: expandedW, height: 436 });
    controlWin.setResizable(false);
  });

  // Collapse control strip back to narrow strip
  ipcMain.on("hide-device-popup", () => {
    const { width: sw } = screen.getPrimaryDisplay().workAreaSize;
    const stripW = 72;
    const stripY = controlWin.getBounds().y;
    const stripX = sw - stripW - 16;
    controlWin.setResizable(true);
    controlWin.setBounds({ x: stripX, y: stripY, width: stripW, height: 436 });
    controlWin.setResizable(false);
  });

  // Open settings in its own centred window
  ipcMain.on("open-settings-window", () => {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.focus();
      return;
    }
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    settingsWin = new BrowserWindow({
      width: 400,
      height: 240,
      x: Math.round((sw - 400) / 2),
      y: Math.round((sh - 240) / 2),
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      resizable: false,
      focusable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: false,
        webSecurity: false,
      },
    });
    settingsWin.loadFile("settings.html");
    settingsWin.on("closed", () => { settingsWin = null; });
  });

  // Close settings window
  ipcMain.on("close-settings", () => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
  });

  // Settings confirmed save folder — relay to controlWin
  ipcMain.on("save-folder-confirmed", (_, folder) => {
    const config = loadConfig();
    config.saveFolder = folder;
    saveConfig(config);
    if (controlWin && !controlWin.isDestroyed()) {
      controlWin.webContents.send("save-folder-chosen", folder);
    }
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
    trackEvent("save-folder-changed", { folder });
  });

  // If overlay is closed, close control window too
  overlayWin.on("closed", () => {
    trackEvent("overlay-closed");
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
    if (controlWin && !controlWin.isDestroyed()) controlWin.close();
    overlayWin = null;
  });

  // Create tray icon
  const iconPath = path.join(__dirname, "assets", "icon.png");
  tray = new Tray(iconPath);

  // Optional: Set a tooltip for the tray icon
  tray.setToolTip("Bloom");

  // Optional: Create a context menu for the tray icon
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open",
      click: () => {
        if (controlWin && !controlWin.isDestroyed()) {
          controlWin.show();
        }
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.show();
        }
      },
    },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
  
  // Track app startup
  trackEvent("app-started");
}

app.whenReady().then(createWindows);

app.on("window-all-closed", () => {
  trackEvent("app-quit");
  app.quit();
});
