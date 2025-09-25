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
let tray = null;
let lastRecordingPath = null;

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
  const startW = 520;
  const startH = 600; // Increased to accommodate resize controls beneath video
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

  // small clickable control window (checkbox)
  controlWin = new BrowserWindow({
    x: startX + startW + 10, // Position to the right of overlay with 10px gap
    y: startY - 10, // Slightly above overlay
    width: 320, // Increased width for new design
    height: 500, // Increased height to accommodate all controls
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    focusable: true, // must be focusable to click
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
  });
  controlWin.webContents.once("did-finish-load", () => {
    controlWin.webContents.send("lock-changed", false);
  });

  // Move overlay window (called from overlay renderer during dragging)
  ipcMain.on("move-window", (_, x, y) => {
    overlayWin.setPosition(Math.round(x), Math.round(y));
    // keep control window positioned to the right of overlay
    const b = overlayWin.getBounds();
    controlWin.setPosition(
      b.x + b.width + 10, // Position to right with 10px gap
      b.y - 10,
      false
    );
  });

  // Move controls window (called from controls renderer during dragging)
  ipcMain.on("move-controls", (_, x, y) => {
    controlWin.setPosition(Math.round(x), Math.round(y));
    // Move overlay window to maintain relative position (controls to right of overlay)
    const controlBounds = controlWin.getBounds();
    const overlayBounds = overlayWin.getBounds();
    overlayWin.setPosition(
      controlBounds.x - overlayBounds.width - 10, // Position overlay to left of controls with 10px gap
      controlBounds.y + 10,
      false
    );
  });

  // Resize overlay window (called from controls when using preset sizes)
  ipcMain.on("resize-overlay", (_, w, h) => {
    trackEvent("resize-overlay", { width: w, height: h });
    // Add extra height for resize controls positioned beneath the video
    const extraHeight = 80; // Space for controls positioned at bottom: -45px
    overlayWin.setSize(Math.round(w), Math.round(h + extraHeight));
    // Reposition controls to maintain alignment to the right
    const overlayBounds = overlayWin.getBounds();
    controlWin.setPosition(
      overlayBounds.x + overlayBounds.width + 10, // Position to right with 10px gap
      overlayBounds.y - 10,
      false
    );
  });

  // Resize controls window (called from controls when collapsing/expanding)
  ipcMain.on("resize-controls", (_, w, h) => {
    mixpanel.track("resize-controls", { width: w, height: h });
    controlWin.setSize(Math.round(w), Math.round(h));
    // Reposition to maintain alignment to the right of overlay
    const overlayBounds = overlayWin.getBounds();
    controlWin.setPosition(
      overlayBounds.x + overlayBounds.width + 10, // Position to right with 10px gap
      overlayBounds.y - 10,
      false
    );
  });

  // Lock toggle from control window
  ipcMain.on("set-lock", (_, locked) => {
    mixpanel.track("lock-changed", { locked: !!locked });
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
    mixpanel.track("recording-ended-by-user");
  });

  // Handle recording errors from renderer
  ipcMain.on("recording-error", (_, error) => {
    controlWin.webContents.send("recording-error", error);
    mixpanel.track("recording-error", { error });
  });

  // Handle recording file saved notification
  ipcMain.on("recording-saved", (_, filePath) => {
    controlWin.webContents.send("recording-saved", filePath);
    mixpanel.track("recording-saved", { filePath });
  });

  // Save recording file
  ipcMain.on("save-recording", async (_, data) => {
    try {
      const { buffer, filename } = data;

      // Save to Desktop by default
      const desktopPath = path.join(os.homedir(), "Desktop");
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
      mixpanel.track("recording-saved", { filePath });
    } catch (err) {
      console.error("Error saving recording file:", err);
      controlWin.webContents.send("recording-error", err.message);
    }
  });

  // Open recordings folder
  ipcMain.on("open-recordings-folder", () => {
    const desktopPath = path.join(os.homedir(), "Desktop");
    mixpanel.track("open-recordings-folder");
    shell.openPath(desktopPath);
  });

  // Open last recorded file in browser
  ipcMain.on("open-recorded-file", () => {
    if (lastRecordingPath && fs.existsSync(lastRecordingPath)) {
      mixpanel.track("open-recorded-file", { filePath: lastRecordingPath });
      shell.openPath(lastRecordingPath);
    } else {
      // Fallback to opening the recordings folder if no specific file
      const desktopPath = path.join(os.homedir(), "Desktop");
      shell.openPath(desktopPath);
    }
  });

  // If overlay is closed, close control window too
  overlayWin.on("closed", () => {
    mixpanel.track("overlay-closed");
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
