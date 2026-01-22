# Quickboard

Quickboard is a modern Angular application that can run as a desktop app using Electron.

## Getting Started

### Prerequisites

- Node.js (v18 or later recommended)
- npm (v9 or later recommended)

### Install dependencies

```bash
npm install
```

### Run in Electron

Builds the Angular app and launches it in Electron:

```bash
npm run electron
```

### Development (Web)

To run the Angular app in your browser for development:

```bash
npm start
```

Then open http://localhost:4200

## Project Structure

- `src/` — Angular application source code
- `electron-main.js` — Electron main process entry point
- `preload.js` — (optional) Electron preload script

## Building for Production

```bash
npm run build
```

Output will be in the `dist/` directory (used by Electron).

## License

MIT
