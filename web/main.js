const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

let overlayWin;
let controlWin;

function createWindows() {
  // initial overlay window size & position
  const startW = 520;
  const startH = 520;
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
      webSecurity: false
    }
  });

  // small clickable control window (checkbox)
  controlWin = new BrowserWindow({
    x: startX + startW - 240, // Position to extend left from overlay
    y: startY - 10, // Slightly above overlay
    width: 240,
    height: 160, // Increased height for recording buttons
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    focusable: true, // must be focusable to click
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: false,
      webSecurity: false
    }
  });

  // Make sure control window stays above overlay
  controlWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setAlwaysOnTop(true, "floating");

  overlayWin.loadFile("index.html");
  controlWin.loadFile("controls.html");

  // Start in "locked" mode (click-through)
  overlayWin.setIgnoreMouseEvents(true, { forward: true });

  // After renderer loads, send initial lock state so UI can reflect it
  overlayWin.webContents.once("did-finish-load", () => {
    overlayWin.webContents.send("lock-changed", true);
  });
  controlWin.webContents.once("did-finish-load", () => {
    controlWin.webContents.send("lock-changed", true);
  });

  // Move overlay window (called from overlay renderer during dragging)
  ipcMain.on("move-window", (_, x, y) => {
    overlayWin.setPosition(Math.round(x), Math.round(y));
    // keep control window positioned to the left of overlay
    const b = overlayWin.getBounds();
    const controlBounds = controlWin.getBounds();
    controlWin.setPosition(b.x + b.width - controlBounds.width, b.y - 10, false);
  });

  // Resize overlay window (called from overlay renderer)
  ipcMain.on("resize-window", (_, w, h) => {
    overlayWin.setSize(Math.round(w), Math.round(h));
    const b = overlayWin.getBounds();
    const controlBounds = controlWin.getBounds();
    controlWin.setPosition(b.x + b.width - controlBounds.width, b.y - 10, false);
  });

  // Resize controls window (called from controls when collapsing/expanding)
  ipcMain.on("resize-controls", (_, w, h) => {
    controlWin.setSize(Math.round(w), Math.round(h));
    // Reposition to maintain alignment with overlay
    const overlayBounds = overlayWin.getBounds();
    controlWin.setPosition(overlayBounds.x + overlayBounds.width - w, overlayBounds.y - 10, false);
  });

  // Lock toggle from control window
  ipcMain.on("set-lock", (_, locked) => {
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
  });

  // Stop overlay
  ipcMain.on("stop-overlay", () => {
    overlayWin.webContents.send("stop-camera");
    controlWin.webContents.send("overlay-status", false);
  });

  // Start screen recording
  ipcMain.on("start-recording", async () => {
    try {
      // Send recording command to overlay window (which has access to desktopCapturer)
      overlayWin.webContents.send("start-screen-recording");
      controlWin.webContents.send("recording-status", true);
    } catch (err) {
      console.error("Error starting recording:", err);
      controlWin.webContents.send("recording-error", err.message);
    }
  });

  // Stop screen recording
  ipcMain.on("stop-recording", () => {
    overlayWin.webContents.send("stop-screen-recording");
    controlWin.webContents.send("recording-status", false);
  });

  // Handle recording file saved notification
  ipcMain.on("recording-saved", (_, filePath) => {
    controlWin.webContents.send("recording-saved", filePath);
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
      
      // Notify control window
      controlWin.webContents.send("recording-saved", filePath);
      
    } catch (err) {
      console.error("Error saving recording file:", err);
      controlWin.webContents.send("recording-error", err.message);
    }
  });

  // If overlay is closed, close control window too
  overlayWin.on("closed", () => {
    if (controlWin && !controlWin.isDestroyed()) controlWin.close();
    overlayWin = null;
  });
}

app.whenReady().then(createWindows);

app.on("window-all-closed", () => {
  app.quit();
});
