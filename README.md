# Bloom - Webcam Overlay & Screen Recording App

A modern Electron-based application that provides a circular webcam overlay with drag-and-drop positioning and screen recording capabilities. Perfect for content creators, streamers, and anyone who needs a professional-looking webcam overlay.

## Features

- 🎥 **Circular Webcam Overlay**: Draggable and resizable circular webcam display
- 📺 **Screen Recording**: Record your screen with audio using modern web APIs
- 🎛️ **Camera Selection**: Choose from available cameras via intuitive controls
- 🔒 **Lock Mode**: Toggle between interactive and click-through modes
- 📱 **Collapsible Controls**: Clean, minimal control interface
- 🍎 **macOS Native**: Includes proper entitlements and system integration
- 🖼️ **System Tray**: Convenient tray icon for easy access

## Prerequisites

- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **macOS** (currently optimized for macOS)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/thepublicdev/bloom.git
cd bloom
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Application

```bash
npm start
```

The app will launch with two windows:
- **Overlay Window**: Circular webcam display (initially click-through)
- **Control Window**: Camera selection and recording controls

## Build Instructions

### Development Build

For testing and development:

```bash
npm run pack
```

This creates an unpacked app in the `dist` folder without creating installers.

### Production Build

#### Build for macOS (Universal)

```bash
npm run build:mac
```

This creates:
- DMG installer (`dist/Bloom-1.0.0-universal.dmg`)
- ZIP archive (`dist/Bloom-1.0.0-universal-mac.zip`)

#### Build All Platforms

```bash
npm run build
```

#### Distribution Build

```bash
npm run dist
```

Creates final distribution packages without publishing.

### Build Output

Built applications will be available in the `dist/` folder:

```
dist/
├── Bloom-1.0.0-universal.dmg      # macOS installer
├── Bloom-1.0.0-universal-mac.zip  # macOS archive
└── mac-universal/                  # Unpacked app
    └── Bloom.app
```

## Usage

### Getting Started

1. **Launch the app** using `npm start` or the built application
2. **Select a camera** from the dropdown in the control window
3. **Click "Start"** to begin the webcam overlay
4. **Unlock** the overlay to drag and resize it
5. **Lock** the overlay when positioned correctly

### Screen Recording

1. **Click "Start Recording"** in the control window
2. **Select screen/window** to record from the macOS picker
3. **Choose audio options** if desired
4. **Click "Stop Recording"** when finished
5. **Files save automatically** to your Desktop

### Keyboard Shortcuts

- **Drag**: Click and drag the overlay (when unlocked)
- **Resize**: Drag the resize handle in the bottom-right corner
- **Lock/Unlock**: Use the control window toggle

## Development

### Project Structure

```
web/
├── main.js              # Electron main process
├── index.html           # Overlay window (webcam display)
├── controls.html        # Control window interface
├── package.json         # Dependencies and build config
├── assets/              # Icons and resources
│   └── icons.png
└── build/               # Build configuration
    └── entitlements.mac.plist
```

### Key Technologies

- **Electron**: Desktop app framework
- **MediaDevices API**: Camera and screen capture
- **MediaRecorder API**: Video recording
- **IPC**: Inter-process communication between windows

### macOS Permissions

The app includes proper entitlements for:
- Camera access
- Microphone access
- Screen recording
- File system access

## Troubleshooting

### Camera Not Working

- Ensure camera permissions are granted in System Preferences
- Try selecting a different camera from the dropdown
- Restart the application

### Recording Issues

- Check screen recording permissions in System Preferences
- Ensure audio is selected in the screen sharing picker
- Verify sufficient disk space for recordings

### Build Errors

- Ensure you're in the `web/` directory
- Run `npm install` to update dependencies
- Check that all required files exist in `assets/` and `build/`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License - see package.json for details.

## Support

For issues and feature requests, please create an issue in the GitHub repository.