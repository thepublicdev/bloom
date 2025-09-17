const { app, BrowserWindow, ipcMain } = require("electron");

let overlayWin;
let controlWin;

function createWindows() {
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
      contextIsolation: false
    }
  });

  // small clickable control window (checkbox)
  controlWin = new BrowserWindow({
    x: startX + 10,
    y: startY + 10,
    width: 160,
    height: 48,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    focusable: true, // must be focusable to click
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
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
    // keep control window near overlay (10px offset)
    const b = overlayWin.getBounds();
    controlWin.setPosition(b.x + 10, b.y + 10, false);
  });

  // Resize overlay window (called from overlay renderer)
  ipcMain.on("resize-window", (_, w, h) => {
    overlayWin.setSize(Math.round(w), Math.round(h));
    const b = overlayWin.getBounds();
    controlWin.setPosition(b.x + 10, b.y + 10, false);
  });

  // Lock toggle from control window
  ipcMain.on("set-lock", (_, locked) => {
    // locked === true -> make overlay click-through
    overlayWin.setIgnoreMouseEvents(!!locked, { forward: true });
    // broadcast new lock state to renderers
    overlayWin.webContents.send("lock-changed", !!locked);
    controlWin.webContents.send("lock-changed", !!locked);
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
