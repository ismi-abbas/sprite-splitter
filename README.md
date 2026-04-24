# Sprite Slicer

Browser-based sprite sheet cleanup tool for AI-generated or uneven animation sheets.

## What It Does

- Upload an existing sprite sheet image
- Slice it into frames using a configurable grid
- Adjust each crop visually with draggable crop handles
- Resize crops freely from any edge or corner
- Preview the extracted frames as an animation
- Export a rebuilt sprite sheet, a single frame, or slice metadata JSON

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
2. Set `columns`, `rows`, `frame width`, and `frame height`.
3. Adjust `offset` and `gap` if the grid does not line up.
4. Click any slice on the source image to edit that frame.
5. Drag any edge or corner to tighten the crop.
6. Use the preview panel to check animation timing.
7. Export the rebuilt sheet or individual frames.

## Exports

- `*-sliced-sheet.png`: rebuilt horizontal sprite sheet
- `*-frame-N.png`: selected cleaned frame
- `*-slice-data.json`: crop metadata for all frames
