# QuickBoard - Copilot Instructions

## Project Overview

QuickBoard is a modern Angular application that runs as a desktop app using Electron. It combines web technologies with native desktop capabilities.

## Tech Stack

- **Frontend Framework**: Angular 21.x
- **Desktop Runtime**: Electron 40.x
- **Package Manager**: npm (v11.6.1)
- **Language**: TypeScript 5.9
- **Build Tool**: Angular CLI
- **Testing**: Vitest 4.x

## Development Environment

### Prerequisites
- Node.js v18 or later (project uses Node.js 24 in CI)
- npm v9 or later

### Setup
```bash
npm install
npm start  # For web development at http://localhost:4200
npm run electron  # For Electron desktop app
```

## Code Style & Formatting

### Prettier Configuration
- **Print Width**: 100 characters
- **Quotes**: Single quotes for strings
- **Trailing Commas**: Always use trailing commas
- **Semicolons**: Always use semicolons
- **Indentation**: 2 spaces (no tabs)
- **Line Endings**: LF (Unix-style)

### TypeScript/JavaScript
- Use TypeScript for all source files
- Follow Angular coding style guidelines
- Arrow functions should always use parentheses around parameters
- Maintain proper spacing in brackets and braces

### HTML Templates
- Use Angular template parser for HTML files
- Follow Angular template best practices
- Maintain accessibility standards (configured in ESLint)

## Linting & Code Quality

### ESLint Configuration
- Uses `@eslint/js`, `typescript-eslint`, and `angular-eslint`
- Enforces recommended rules for TypeScript and Angular
- **Component Selectors**: Use kebab-case with 'app' prefix (e.g., `app-user-profile`)
- **Directive Selectors**: Use camelCase with 'app' prefix (e.g., `appHighlight`)
- **Template Linting**: Includes accessibility checks

### Running Linter
```bash
npm run lint
```

## Building & Testing

### Build Commands
- `npm run build` - Production build (output to `dist/`)
- `npm run watch` - Development build with watch mode
- `npm run electron` - Build and launch in Electron

### Testing
- Run tests with `npm test`
- Uses Vitest for testing

### CI/CD
- **Build Workflow**: Runs on push/PR to main branch
- **Lint Workflow**: Runs on push/PR to main branch
- Both use Node.js 24 and `npm ci` for dependency installation

## Angular Specifics

### Component Structure
- Place components in appropriate feature directories under `src/app/`
- Follow Angular style guide for file naming: `component-name.component.ts`
- Keep components focused and single-responsibility

### State Management
- Uses `@ngrx/signals` for state management
- Follow established patterns for signal-based state

## Dependencies

### Key Libraries
- **UI/Drawing**: literallycanvas (canvas-based drawing)
- **Rich Text**: Editor.js with plugins (header, list, paragraph)
- **Media**: FFmpeg for video/audio processing
- **PDF**: jsPDF for PDF generation
- **Compression**: JSZip for file compression
- **Audio**: Tone.js for audio synthesis

### Installing Dependencies
- Use `npm install <package>` to add new dependencies
- Run `npm ci` in CI environments for reproducible builds
- Project includes a postinstall script (`patch-literallycanvas.js`)

## Electron Integration

### Main Process
- Entry point: `electron-main.js`
- Manages window lifecycle and native OS integration

### Renderer Process
- Angular application serves as the renderer process
- Build output from `dist/` is loaded by Electron

### Development
- Use `npm run electron:dev` for development with auto-rebuild
- Uses `wait-on` to ensure build completes before launching Electron

## File Structure

```
.
├── src/
│   ├── app/          # Angular application
│   ├── electron/     # Electron-specific code
│   ├── ui/           # UI components
│   ├── data/         # Data models/services
│   └── styles/       # Global styles
├── electron-main.js  # Electron main process
├── public/           # Static assets
└── dist/             # Build output (gitignored)
```

## Best Practices

### Code Changes
- Make minimal, focused changes
- Ensure changes pass linting (`npm run lint`)
- Build successfully (`npm run build`)
- Follow existing code patterns and conventions

### Pull Requests
- All code must pass CI checks (build + lint)
- Keep changes atomic and well-scoped
- Update documentation if needed

### Commits
- Write clear, descriptive commit messages
- Reference issue numbers when applicable

## Common Tasks

### Adding a New Component
```bash
ng generate component component-name
```

### Adding a New Service
```bash
ng generate service service-name
```

### Updating Dependencies
Check for security vulnerabilities before adding or updating packages. Use stable versions compatible with Angular 21.x.
