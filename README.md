# Sprite Slicer

Browser-based sprite sheet cleanup tool for AI-generated or uneven animation sheets.

## What It Does

- Upload an existing sprite sheet image
- Generate frame regions from a configurable split grid
- Give every frame its own `x`, `y`, `width`, and `height`
- Move and resize each frame region independently
- Preview frames inside a fixed export cell
- Export packed sheets like `4x4`, `8x1`, or any custom rows/columns layout
- Use SNES-friendly export presets such as `16x16`, `32x32`, `64x64`, `16x32`, and `32x64`
- Export a packed sprite sheet, a single frame, or region metadata JSON
- Export the animation as a GIF using the current frame order and FPS

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS 4

## Development

```bash
pnpm install
pnpm dev
```

## Production Build

```bash
pnpm build
pnpm preview
```

## Workflow

1. Upload a sprite sheet.
2. Set the source split grid with `columns`, `rows`, `frame width`, `frame height`, `offset`, and `gap`.
3. Run `Split frames` to generate editable regions.
4. Click any region in the editor.
5. Drag inside the region to move it, or drag edges and corners to resize it.
6. Set the export layout and output cell size.
7. Choose a SNES preset or enter a custom export size.
8. Preview the packed frame output.
9. Export the final sheet, GIF, or individual frames.

## Exports

- `*-sheet-CxR.png`: packed sprite sheet using the chosen export columns and rows
- `*.gif`: animated GIF using the current frame order, output cell size, and FPS
- `*-frame-N.png`: selected frame rendered into the chosen export cell size
- `*-regions.json`: split settings, export settings, and per-frame region coordinates
