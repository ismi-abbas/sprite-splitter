import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { useEffect, useMemo, useState } from "react";

type SplitConfig = {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  offsetX: number;
  offsetY: number;
  gapX: number;
  gapY: number;
};

type ExportConfig = {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  preset: ExportPreset;
};

type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LoadedImage = {
  name: string;
  src: string;
  width: number;
  height: number;
};

type ResizeMode =
  | "move"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type DragState = {
  mode: ResizeMode;
  startX: number;
  startY: number;
  stageWidth: number;
  stageHeight: number;
  startRegion: Region;
  previewRegion: Region;
  frameIndex: number;
};

type ExportPreset = "snes-16" | "snes-32" | "snes-64" | "snes-16x32" | "snes-32x64" | "custom";

const DEFAULT_SPLIT: SplitConfig = {
  columns: 4,
  rows: 1,
  frameWidth: 256,
  frameHeight: 256,
  offsetX: 0,
  offsetY: 0,
  gapX: 0,
  gapY: 0,
};

const DEFAULT_EXPORT: ExportConfig = {
  columns: 4,
  rows: 1,
  frameWidth: 32,
  frameHeight: 32,
  preset: "snes-32",
};

const panelClass =
  "panel-shell grid gap-4 border border-app-border bg-app-surface p-4 shadow-panel md:p-6";
const eyebrowClass = "m-0 text-[0.72rem] uppercase tracking-[0.18em] text-app-muted";
const fieldClass = "control-field grid gap-2";
const inputClass =
  "control-input min-h-11 border border-app-border/90 bg-app-raised px-3.5 py-3 text-app-text outline-none transition focus:border-app-accent focus:ring-2 focus:ring-app-accent/60 disabled:cursor-not-allowed disabled:opacity-55";
const secondaryButtonClass =
  "control-button min-h-11 border border-app-border bg-app-raised px-4 py-3 text-app-text transition enabled:hover:-translate-y-px enabled:hover:border-app-accent/70 enabled:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "control-button min-h-11 border border-app-accent-strong bg-app-accent-strong px-4 py-3 text-app-ink transition enabled:hover:-translate-y-px enabled:hover:brightness-105 enabled:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";
const handleBaseClass = "resize-handle absolute z-10 block";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function toGridInteger(value: number, fallback: number) {
  return Math.max(1, Math.round(toFiniteNumber(value, fallback)));
}

function detectFrameSizeFromGrid(config: SplitConfig, image: LoadedImage) {
  const widthAvailable =
    image.width - config.offsetX - (config.columns - 1) * config.gapX;
  const heightAvailable =
    image.height - config.offsetY - (config.rows - 1) * config.gapY;

  return {
    frameWidth: Math.max(1, Math.floor(widthAvailable / config.columns)),
    frameHeight: Math.max(1, Math.floor(heightAvailable / config.rows)),
  };
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function guessSplitConfig(width: number, height: number): SplitConfig {
  if (width >= height * 2) {
    const columns = clamp(Math.round(width / height), 2, 12);
    return {
      columns,
      rows: 1,
      frameWidth: Math.floor(width / columns),
      frameHeight: height,
      offsetX: 0,
      offsetY: 0,
      gapX: 0,
      gapY: 0,
    };
  }

  return {
    columns: 4,
    rows: 4,
    frameWidth: Math.max(1, Math.floor(width / 4)),
    frameHeight: Math.max(1, Math.floor(height / 4)),
    offsetX: 0,
    offsetY: 0,
    gapX: 0,
    gapY: 0,
  };
}

function guessExportPreset(width: number, height: number): ExportConfig {
  const largest = Math.max(width, height);

  if (width <= 16 && height <= 16) {
    return {
      columns: 4,
      rows: 4,
      frameWidth: 16,
      frameHeight: 16,
      preset: "snes-16",
    };
  }

  if (width <= 16 && height <= 32) {
    return {
      columns: 4,
      rows: 4,
      frameWidth: 16,
      frameHeight: 32,
      preset: "snes-16x32",
    };
  }

  if (width <= 32 && height <= 32) {
    return {
      columns: 4,
      rows: 4,
      frameWidth: 32,
      frameHeight: 32,
      preset: "snes-32",
    };
  }

  if (width <= 32 && height <= 64) {
    return {
      columns: 4,
      rows: 4,
      frameWidth: 32,
      frameHeight: 64,
      preset: "snes-32x64",
    };
  }

  if (largest <= 64) {
    return {
      columns: 4,
      rows: 4,
      frameWidth: 64,
      frameHeight: 64,
      preset: "snes-64",
    };
  }

  return {
    columns: 4,
    rows: 4,
    frameWidth: Math.max(1, width),
    frameHeight: Math.max(1, height),
    preset: "custom",
  };
}

function presetToSize(preset: ExportPreset) {
  switch (preset) {
    case "snes-16":
      return { width: 16, height: 16 };
    case "snes-32":
      return { width: 32, height: 32 };
    case "snes-64":
      return { width: 64, height: 64 };
    case "snes-16x32":
      return { width: 16, height: 32 };
    case "snes-32x64":
      return { width: 32, height: 64 };
    case "custom":
      return null;
  }
}

function splitRegionsFromGrid(config: SplitConfig) {
  const count = config.columns * config.rows;
  return Array.from({ length: count }, (_, index) =>
    regionFromGridIndex(config, index),
  );
}

function regionFromGridIndex(config: SplitConfig, index: number) {
  const column = index % config.columns;
  const row = Math.floor(index / config.columns);
  return {
    x: config.offsetX + column * (config.frameWidth + config.gapX),
    y: config.offsetY + row * (config.frameHeight + config.gapY),
    width: config.frameWidth,
    height: config.frameHeight,
  };
}

function splitRegionsForImage(config: SplitConfig, image: LoadedImage | null) {
  const regions = splitRegionsFromGrid(config);
  return image ? regions.map((region) => clampRegion(region, image)) : regions;
}

function clampRegion(region: Region, image: LoadedImage) {
  const x = clamp(region.x, 0, image.width - 1);
  const y = clamp(region.y, 0, image.height - 1);
  const width = clamp(region.width, 1, image.width - x);
  const height = clamp(region.height, 1, image.height - y);
  return { x, y, width, height };
}

function getDraggedRegion(mode: ResizeMode, deltaX: number, deltaY: number, start: Region) {
  switch (mode) {
    case "move":
      return { ...start, x: start.x + deltaX, y: start.y + deltaY };
    case "left":
      return {
        ...start,
        x: start.x + deltaX,
        width: start.width - deltaX,
      };
    case "right":
      return { ...start, width: start.width + deltaX };
    case "top":
      return {
        ...start,
        y: start.y + deltaY,
        height: start.height - deltaY,
      };
    case "bottom":
      return { ...start, height: start.height + deltaY };
    case "top-left":
      return {
        x: start.x + deltaX,
        y: start.y + deltaY,
        width: start.width - deltaX,
        height: start.height - deltaY,
      };
    case "top-right":
      return {
        x: start.x,
        y: start.y + deltaY,
        width: start.width + deltaX,
        height: start.height - deltaY,
      };
    case "bottom-left":
      return {
        x: start.x + deltaX,
        y: start.y,
        width: start.width - deltaX,
        height: start.height + deltaY,
      };
    case "bottom-right":
      return {
        x: start.x,
        y: start.y,
        width: start.width + deltaX,
        height: start.height + deltaY,
      };
  }
}

function drawRegionToCanvas(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  region: Region,
  outputWidth: number,
  outputHeight: number,
  offsetX = 0,
  offsetY = 0,
) {
  const dx = offsetX + Math.floor((outputWidth - region.width) / 2);
  const dy = offsetY + Math.floor((outputHeight - region.height) / 2);
  ctx.drawImage(
    image,
    region.x,
    region.y,
    region.width,
    region.height,
    dx,
    dy,
    region.width,
    region.height,
  );
}

function getFrameImageUrl(
  image: HTMLImageElement,
  region: Region,
  outputWidth: number,
  outputHeight: number,
) {
  const canvas = createCanvas(outputWidth, outputHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.imageSmoothingEnabled = false;
  drawRegionToCanvas(ctx, image, region, outputWidth, outputHeight);
  return canvas.toDataURL("image/png");
}

async function loadHtmlImage(src: string) {
  const image = new Image();
  image.src = src;

  await new Promise<void>((resolve) => {
    if (image.complete) {
      resolve();
      return;
    }
    image.onload = () => resolve();
  });

  return image;
}

function renderRegionCanvas(
  image: HTMLImageElement,
  region: Region,
  outputWidth: number,
  outputHeight: number,
) {
  const canvas = createCanvas(outputWidth, outputHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;
  drawRegionToCanvas(ctx, image, region, outputWidth, outputHeight);
  return { canvas, ctx };
}

function getTransparentPaletteIndex(palette: number[][]) {
  const transparentIndex = palette.findIndex((color) => color[3] === 0);
  return transparentIndex >= 0 ? transparentIndex : 0;
}

function getHandleClass(mode: ResizeMode) {
  switch (mode) {
    case "left":
      return `${handleBaseClass} resize-handle-edge resize-handle-left -left-[22px] top-0 h-full w-11 cursor-ew-resize`;
    case "right":
      return `${handleBaseClass} resize-handle-edge resize-handle-right -right-[22px] top-0 h-full w-11 cursor-ew-resize`;
    case "top":
      return `${handleBaseClass} resize-handle-edge resize-handle-top -top-[22px] left-0 h-11 w-full cursor-ns-resize`;
    case "bottom":
      return `${handleBaseClass} resize-handle-edge resize-handle-bottom -bottom-[22px] left-0 h-11 w-full cursor-ns-resize`;
    case "top-left":
      return `${handleBaseClass} resize-handle-corner -left-[22px] -top-[22px] h-11 w-11 cursor-nwse-resize`;
    case "top-right":
      return `${handleBaseClass} resize-handle-corner -right-[22px] -top-[22px] h-11 w-11 cursor-nesw-resize`;
    case "bottom-left":
      return `${handleBaseClass} resize-handle-corner -bottom-[22px] -left-[22px] h-11 w-11 cursor-nesw-resize`;
    case "bottom-right":
      return `${handleBaseClass} resize-handle-corner -bottom-[22px] -right-[22px] h-11 w-11 cursor-nwse-resize`;
    case "move":
      return "";
  }
}

function getRegionSummary(region: Region) {
  return `left ${region.x}, top ${region.y}, width ${region.width}, height ${region.height}`;
}

function App() {
  const [sourceImage, setSourceImage] = useState<LoadedImage | null>(null);
  const [splitConfig, setSplitConfig] = useState<SplitConfig>(DEFAULT_SPLIT);
  const [exportConfig, setExportConfig] = useState<ExportConfig>(DEFAULT_EXPORT);
  const [regions, setRegions] = useState<Region[]>(splitRegionsFromGrid(DEFAULT_SPLIT));
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [fps, setFps] = useState(8);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playhead, setPlayhead] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [frameImageUrls, setFrameImageUrls] = useState<string[]>([]);
  const [status, setStatus] = useState(
    "Upload a sprite sheet, split it into regions, then move and resize each frame independently.",
  );

  const frameCount = regions.length;
  const selectedRegion = regions[selectedFrame] ?? null;
  const liveSelectedRegion =
    dragState && dragState.frameIndex === selectedFrame ? dragState.previewRegion : selectedRegion;
  const previewIndex = isPlaying ? playhead : selectedFrame;

  useEffect(() => {
    if (!isPlaying || frameCount < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setPlayhead((current) => (current + 1) % frameCount);
    }, 1000 / fps);

    return () => window.clearInterval(interval);
  }, [fps, frameCount, isPlaying]);

  useEffect(() => {
    if (!dragState || !sourceImage) return;

    const activeDrag = dragState;
    const activeImage = sourceImage;
    let dragFrame: number | null = null;
    let latestPreviewRegion: Region | null = activeDrag.previewRegion;

    function handlePointerMove(event: PointerEvent) {
      if (activeDrag.stageWidth === 0 || activeDrag.stageHeight === 0) return;

      const deltaX = Math.round(
        (event.clientX - activeDrag.startX) * (activeImage.width / activeDrag.stageWidth),
      );
      const deltaY = Math.round(
        (event.clientY - activeDrag.startY) * (activeImage.height / activeDrag.stageHeight),
      );

      const nextRegion = clampRegion(
        getDraggedRegion(activeDrag.mode, deltaX, deltaY, activeDrag.startRegion),
        activeImage,
      );

      latestPreviewRegion = nextRegion;
      if (dragFrame !== null) return;

      dragFrame = window.requestAnimationFrame(() => {
        dragFrame = null;
        const previewRegion = latestPreviewRegion;
        if (!previewRegion) return;
        setDragState((current) =>
          current
            ? {
                ...current,
                previewRegion,
              }
            : current,
        );
      });
    }

    function handlePointerUp() {
      const finalRegion = latestPreviewRegion ?? activeDrag.previewRegion;
      setRegions((current) =>
        current.map((region, index) => (index === activeDrag.frameIndex ? finalRegion : region)),
      );
      latestPreviewRegion = null;
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      if (dragFrame !== null) {
        window.cancelAnimationFrame(dragFrame);
        dragFrame = null;
      }
    };
  }, [dragState, sourceImage]);

  useEffect(() => {
    if (!sourceImage || regions.length === 0) {
      const frame = window.requestAnimationFrame(() => setFrameImageUrls([]));
      return () => window.cancelAnimationFrame(frame);
    }

    let ignore = false;
    const image = new Image();
    image.onload = () => {
      if (ignore) return;
      setFrameImageUrls(
        regions.map((region) =>
          getFrameImageUrl(image, region, exportConfig.frameWidth, exportConfig.frameHeight),
        ),
      );
    };
    image.src = sourceImage.src;

    return () => {
      ignore = true;
    };
  }, [exportConfig.frameHeight, exportConfig.frameWidth, regions, sourceImage]);

  const displayRegions = useMemo(() => {
    if (!dragState) return regions;
    return regions.map((region, index) =>
      index === dragState.frameIndex ? dragState.previewRegion : region,
    );
  }, [dragState, regions]);

  const sourceBoxData = useMemo(() => {
    if (!sourceImage) return [];
    return displayRegions.map((region) => ({
      left: `${(region.x / sourceImage.width) * 100}%`,
      top: `${(region.y / sourceImage.height) * 100}%`,
      width: `${(region.width / sourceImage.width) * 100}%`,
      height: `${(region.height / sourceImage.height) * 100}%`,
    }));
  }, [displayRegions, sourceImage]);

  function updateSplitConfig<Key extends keyof SplitConfig>(key: Key, value: number) {
    setSplitConfig((current) => {
      const currentValue = current[key];
      const nextValue =
        key === "columns" || key === "rows"
          ? toGridInteger(value, currentValue)
          : Math.max(
              key === "offsetX" || key === "offsetY" || key === "gapX" || key === "gapY"
                ? -9999
                : 1,
              toFiniteNumber(value, currentValue),
            );
      const nextConfig = {
        ...current,
        [key]: nextValue,
      };

      if (
        sourceImage &&
        (key === "columns" ||
          key === "rows" ||
          key === "offsetX" ||
          key === "offsetY" ||
          key === "gapX" ||
          key === "gapY")
      ) {
        return {
          ...nextConfig,
          ...detectFrameSizeFromGrid(nextConfig, sourceImage),
        };
      }

      return nextConfig;
    });
  }

  function updateExportConfig<Key extends keyof ExportConfig>(key: Key, value: ExportConfig[Key]) {
    setExportConfig((current) => ({ ...current, [key]: value }));
  }

  function applyExportPreset(preset: ExportPreset) {
    const size = presetToSize(preset);
    if (!size) {
      setExportConfig((current) => ({ ...current, preset }));
      return;
    }

    setExportConfig((current) => ({
      ...current,
      preset,
      frameWidth: size.width,
      frameHeight: size.height,
    }));
    setStatus(`Applied ${size.width}x${size.height} export cells for a SNES-style sprite sheet.`);
  }

  function updateSelectedRegion<Key extends keyof Region>(key: Key, value: number) {
    if (!sourceImage) return;
    setRegions((current) =>
      current.map((region, index) =>
        index === selectedFrame ? clampRegion({ ...region, [key]: value }, sourceImage) : region,
      ),
    );
  }

  function nudgeSelectedRegion(deltaX: number, deltaY: number, resize = false) {
    if (!sourceImage || !selectedRegion) return;

    setRegions((current) =>
      current.map((region, index) => {
        if (index !== selectedFrame) return region;
        return clampRegion(
          resize
            ? {
                ...region,
                width: region.width + deltaX,
                height: region.height + deltaY,
              }
            : {
                ...region,
                x: region.x + deltaX,
                y: region.y + deltaY,
              },
          sourceImage,
        );
      }),
    );
    setStatus(
      resize
        ? "Resized the selected crop box with the keyboard."
        : "Moved the selected crop box with the keyboard.",
    );
  }

  function handleRegionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (index !== selectedFrame) return;

    const step = event.shiftKey ? 8 : 1;
    const resize = event.altKey;
    const keyDelta: Partial<Record<string, [number, number]>> = {
      ArrowLeft: resize ? [-step, 0] : [-step, 0],
      ArrowRight: resize ? [step, 0] : [step, 0],
      ArrowUp: resize ? [0, -step] : [0, -step],
      ArrowDown: resize ? [0, step] : [0, step],
    };
    const delta = keyDelta[event.key];
    if (!delta) return;

    event.preventDefault();
    nudgeSelectedRegion(delta[0], delta[1], resize);
  }

  function respliceRegions() {
    const nextRegions = splitRegionsForImage(splitConfig, sourceImage);
    setRegions(nextRegions);
    setSelectedFrame(0);
    setPlayhead(0);
    setExportConfig((current) => ({
      ...current,
      columns: splitConfig.columns,
      rows: splitConfig.rows,
    }));
    setStatus(
      `Respliced ${nextRegions.length} regions from a ${splitConfig.columns}x${splitConfig.rows} grid.`,
    );
  }

  function addRegion() {
    if (!sourceImage) return;

    const nextRegion = clampRegion(
      regionFromGridIndex(splitConfig, regions.length),
      sourceImage,
    );
    const nextRegions = [...regions, nextRegion];
    const nextSelectedFrame = nextRegions.length - 1;
    const nextRows = Math.max(
      splitConfig.rows,
      Math.ceil(nextRegions.length / splitConfig.columns),
    );

    setRegions(nextRegions);
    setSelectedFrame(nextSelectedFrame);
    setPlayhead(nextSelectedFrame);
    setSplitConfig((current) => ({ ...current, rows: nextRows }));
    setExportConfig((current) => ({
      ...current,
      rows: Math.max(current.rows, Math.ceil(nextRegions.length / current.columns)),
    }));
    setStatus(`Added region #${nextRegions.length}. Existing regions were preserved.`);
  }

  function removeSelectedRegion() {
    if (!sourceImage || regions.length === 0) return;

    const nextRegions = regions.filter((_, index) => index !== selectedFrame);
    const nextSelectedFrame = clamp(selectedFrame, 0, Math.max(nextRegions.length - 1, 0));

    setRegions(nextRegions);
    setSelectedFrame(nextSelectedFrame);
    setPlayhead(nextSelectedFrame);
    setStatus(
      nextRegions.length === 0
        ? "Removed the last region. Add a region or resplice the grid to continue."
        : `Removed region #${selectedFrame + 1}. ${nextRegions.length} regions remain.`,
    );
  }

  function autoSplitFromImage() {
    if (!sourceImage) return;
    const nextSplit = guessSplitConfig(sourceImage.width, sourceImage.height);
    setSplitConfig(nextSplit);
    setRegions(splitRegionsForImage(nextSplit, sourceImage));
    const nextExport = guessExportPreset(nextSplit.frameWidth, nextSplit.frameHeight);
    setExportConfig({
      ...nextExport,
      columns: nextSplit.columns,
      rows: nextSplit.rows,
    });
    setSelectedFrame(0);
    setPlayhead(0);
    setStatus(
      "Rebuilt the regions from the uploaded sheet and applied an SNES-style export preset.",
    );
  }

  function startDrag(mode: ResizeMode, event: React.PointerEvent<HTMLElement>) {
    if (!selectedRegion) return;
    event.preventDefault();
    event.stopPropagation();
    const stage = (event.target as Element | null)?.closest("[data-stage='source']");
    const rect = stage?.getBoundingClientRect();
    if (!rect) return;

    setDragState({
      mode,
      startX: event.clientX,
      startY: event.clientY,
      stageWidth: rect.width,
      stageHeight: rect.height,
      startRegion: selectedRegion,
      previewRegion: selectedRegion,
      frameIndex: selectedFrame,
    });

    setStatus(
      mode === "move"
        ? "Drag the selected region to reposition the crop box."
        : "Drag any edge or corner to resize the selected region freely.",
    );
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const result = reader.result;

      const image = new Image();
      image.onload = () => {
        const loaded = {
          name: file.name.replace(/\.[^.]+$/, ""),
          src: result,
          width: image.naturalWidth,
          height: image.naturalHeight,
        };

        const nextSplit = guessSplitConfig(image.naturalWidth, image.naturalHeight);
        const nextExport = guessExportPreset(nextSplit.frameWidth, nextSplit.frameHeight);

        setSourceImage(loaded);
        setSplitConfig(nextSplit);
        setRegions(splitRegionsFromGrid(nextSplit));
        setExportConfig({
          ...nextExport,
          columns: nextSplit.columns,
          rows: nextSplit.rows,
        });
        setSelectedFrame(0);
        setPlayhead(0);
        setStatus(
          `Loaded ${file.name}. Split the sheet, then move and resize each region independently.`,
        );
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
  }

  async function exportSpriteSheet() {
    if (!sourceImage || regions.length === 0) return;

    const capacity = exportConfig.columns * exportConfig.rows;
    const canvas = createCanvas(
      exportConfig.columns * exportConfig.frameWidth,
      exportConfig.rows * exportConfig.frameHeight,
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    const image = await loadHtmlImage(sourceImage.src);

    regions.slice(0, capacity).forEach((region, index) => {
      const column = index % exportConfig.columns;
      const row = Math.floor(index / exportConfig.columns);
      drawRegionToCanvas(
        ctx,
        image,
        region,
        exportConfig.frameWidth,
        exportConfig.frameHeight,
        column * exportConfig.frameWidth,
        row * exportConfig.frameHeight,
      );
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    downloadBlob(
      blob,
      `${sourceImage.name || "sprite"}-sheet-${exportConfig.columns}x${exportConfig.rows}.png`,
    );
    setStatus("Exported a packed sprite sheet using the current output grid and frame size.");
  }

  async function exportSelectedFrame() {
    if (!sourceImage || !selectedRegion) return;

    const image = await loadHtmlImage(sourceImage.src);
    const rendered = renderRegionCanvas(
      image,
      selectedRegion,
      exportConfig.frameWidth,
      exportConfig.frameHeight,
    );
    if (!rendered) return;

    const { canvas } = rendered;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    downloadBlob(blob, `${sourceImage.name || "sprite"}-frame-${selectedFrame + 1}.png`);
    setStatus("Exported the selected frame into the current output cell size.");
  }

  async function exportGif() {
    if (!sourceImage || regions.length === 0) return;

    const image = await loadHtmlImage(sourceImage.src);
    const gif = GIFEncoder();
    const delay = Math.max(20, Math.round(1000 / Math.max(fps, 1)));

    regions.forEach((region) => {
      const rendered = renderRegionCanvas(
        image,
        region,
        exportConfig.frameWidth,
        exportConfig.frameHeight,
      );
      if (!rendered) return;

      const { ctx } = rendered;
      const rgba = ctx.getImageData(0, 0, exportConfig.frameWidth, exportConfig.frameHeight).data;
      const palette = quantize(rgba, 256, {
        format: "rgba4444",
        oneBitAlpha: true,
      }) as number[][];
      const index = applyPalette(rgba, palette, "rgba4444");
      const transparentIndex = getTransparentPaletteIndex(palette);

      gif.writeFrame(index, exportConfig.frameWidth, exportConfig.frameHeight, {
        palette,
        delay,
        repeat: 0,
        transparent: true,
        transparentIndex,
      });
    });

    gif.finish();

    const bytes = gif.bytes();
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([buffer], { type: "image/gif" });
    downloadBlob(blob, `${sourceImage.name || "sprite"}.gif`);
    setStatus("Exported an animated GIF using the current frame order, FPS, and output cell size.");
  }

  function exportMetadata() {
    if (!sourceImage || regions.length === 0) return;

    const metadata = {
      source: sourceImage.name,
      frameRate: fps,
      split: splitConfig,
      export: exportConfig,
      frames: regions.map((region, index) => ({
        index,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      })),
    };

    downloadBlob(
      new Blob([JSON.stringify(metadata, null, 2)], {
        type: "application/json",
      }),
      `${sourceImage.name || "sprite"}-regions.json`,
    );
    setStatus("Exported region coordinates and output sheet settings.");
  }

  return (
    <div className="app-backdrop min-h-screen px-3 py-4 text-app-text md:px-4 md:py-6">
      <div className="mx-auto grid w-full max-w-[1440px] gap-4">
        <header className="hero-shell grid gap-5 border border-app-border bg-app-surface p-4 shadow-panel sm:p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.8fr)] lg:items-end">
          <div>
            <p className={eyebrowClass}>Sprite Slicer</p>
            <h1 className="max-w-[15ch] font-display text-[2.25rem] leading-[0.98] tracking-[-0.04em] text-app-text sm:text-4xl lg:text-[3.8rem]">
              Split, edit, and pack sprite regions into game-ready sheets.
            </h1>
          </div>
          <div className="grid max-w-[34ch] gap-3">
            <p className="m-0 max-w-[65ch] text-app-muted">
              Build independent crop regions from a sheet, edit each region like a real frame box,
              then export packed layouts such as 4x4 using SNES-friendly cell sizes.
            </p>
            <label
              className={`${primaryButtonClass} relative inline-flex cursor-pointer items-center justify-center`}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileUpload}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label={
                  sourceImage ? "Replace source sprite sheet" : "Upload source sprite sheet"
                }
              />
              <span>{sourceImage ? "Replace source sheet" : "Upload sprite sheet"}</span>
            </label>
          </div>
        </header>

        <main className="workspace-grid grid gap-4 xl:grid-cols-[minmax(16rem,19rem)_minmax(32rem,1.85fr)_minmax(17rem,20rem)]">
          <section className={panelClass} aria-labelledby="split-setup-heading">
            <div className="grid gap-1">
              <p className={eyebrowClass}>Split Setup</p>
              <h2
                id="split-setup-heading"
                className="font-display text-[1.2rem] leading-[1.1] tracking-[-0.04em] text-app-text"
              >
                Source base
              </h2>
            </div>

            <div className="control-grid grid sm:grid-cols-2 xl:grid-cols-2">
              {[
                ["Columns", splitConfig.columns, "columns"],
                ["Rows", splitConfig.rows, "rows"],
                ["Frame width", splitConfig.frameWidth, "frameWidth"],
                ["Frame height", splitConfig.frameHeight, "frameHeight"],
                ["Offset X", splitConfig.offsetX, "offsetX"],
                ["Offset Y", splitConfig.offsetY, "offsetY"],
                ["Gap X", splitConfig.gapX, "gapX"],
                ["Gap Y", splitConfig.gapY, "gapY"],
              ].map(([label, value, key]) => (
                <label key={String(key)} className={fieldClass}>
                  <span className="text-[0.92rem] text-app-muted">{label}</span>
                  <input
                    type="number"
                    aria-label={`Split ${String(label).toLowerCase()}`}
                    min={
                      key === "columns" ||
                      key === "rows" ||
                      key === "frameWidth" ||
                      key === "frameHeight"
                        ? "1"
                        : undefined
                    }
                    value={value}
                    onChange={(event) =>
                      updateSplitConfig(key as keyof SplitConfig, event.target.valueAsNumber)
                    }
                    className={inputClass}
                  />
                </label>
              ))}
            </div>

            <div className="control-actions grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={autoSplitFromImage}
                disabled={!sourceImage}
                aria-describedby="status-message"
              >
                Re-auto split
              </button>
              <button
                type="button"
                className={primaryButtonClass}
                onClick={respliceRegions}
                disabled={!sourceImage}
                aria-describedby="status-message"
              >
                Resplice grid
              </button>
            </div>

            <div className="grid gap-1">
              <p className={eyebrowClass}>Selected Region</p>
              <h2 className="font-display text-[1.2rem] leading-[1.1] tracking-[-0.04em] text-app-text">
                Frame box
              </h2>
            </div>

            <p className="m-0 max-w-[65ch] text-app-muted">
              Each frame has its own left, top, width, and height. After splitting, every box can
              move and resize independently.
            </p>

            <div className="control-actions grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={addRegion}
                disabled={!sourceImage}
                aria-describedby="status-message"
              >
                Add region
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={removeSelectedRegion}
                disabled={!sourceImage || regions.length === 0}
                aria-describedby="status-message"
              >
                Remove selected
              </button>
            </div>

            <div className="control-grid grid sm:grid-cols-2 xl:grid-cols-2">
              {[
                ["Left", selectedRegion?.x ?? 0, "x"],
                ["Top", selectedRegion?.y ?? 0, "y"],
                ["Width", selectedRegion?.width ?? 0, "width"],
                ["Height", selectedRegion?.height ?? 0, "height"],
              ].map(([label, value, key]) => (
                <label key={String(key)} className={fieldClass}>
                  <span className="text-[0.92rem] text-app-muted">{label}</span>
                  <input
                    type="number"
                    aria-label={`Selected frame ${String(label).toLowerCase()}`}
                    min={key === "width" || key === "height" ? "1" : undefined}
                    value={value}
                    onChange={(event) =>
                      updateSelectedRegion(key as keyof Region, Number(event.target.value))
                    }
                    className={inputClass}
                    disabled={!sourceImage || !selectedRegion}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className={`${panelClass} editor-panel`} aria-labelledby="editor-heading">
            <div className="editor-toolbar grid gap-3">
              <div>
                <p className={eyebrowClass}>Editor</p>
                <h2
                  id="editor-heading"
                  className="font-display text-[1.2rem] leading-[1.1] tracking-[-0.04em] text-app-text"
                >
                  {liveSelectedRegion
                    ? `Frame ${selectedFrame + 1} crop box`
                    : "Upload an image to start"}
                </h2>
              </div>
              {liveSelectedRegion ? (
                <dl
                  className="region-readout grid grid-cols-2 gap-2 sm:grid-cols-4"
                  aria-label={getRegionSummary(liveSelectedRegion)}
                >
                  {[
                    ["Left", liveSelectedRegion.x],
                    ["Top", liveSelectedRegion.y],
                    ["Width", liveSelectedRegion.width],
                    ["Height", liveSelectedRegion.height],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="region-stat">
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <p className="m-0 max-w-[72ch] text-app-muted">
                Select a frame, drag inside to move, drag edges or corners to resize. Keyboard:
                arrows move, Alt+arrows resize, Shift increases the step.
              </p>
            </div>

            {sourceImage ? (
              <div
                data-stage="source"
                className="stage-shell relative overflow-hidden border border-app-border bg-app-raised"
                aria-label="Source sprite sheet region editor"
              >
                <img
                  src={sourceImage.src}
                  alt="Uploaded sprite sheet"
                  className="block h-auto w-full"
                />
                <div className="absolute inset-0">
                  {displayRegions.map((region, index) => (
                    <button
                      key={`overlay-${index}`}
                      type="button"
                      className={`region-box absolute m-0 touch-none overflow-visible p-0 text-left ${
                        index === selectedFrame ? "region-box-active" : "region-box-idle"
                      }`}
                      style={sourceBoxData[index]}
                      aria-label={`Frame ${index + 1} crop region, ${getRegionSummary(region)}`}
                      aria-pressed={index === selectedFrame}
                      aria-describedby="editor-heading"
                      onClick={() => {
                        setSelectedFrame(index);
                        setPlayhead(index);
                        setIsPlaying(false);
                      }}
                      onKeyDown={(event) => handleRegionKeyDown(event, index)}
                      onPointerDown={(event) => {
                        if (index !== selectedFrame) return;
                        startDrag("move", event);
                      }}
                    >
                      <span className="pointer-events-none absolute left-[0.35rem] top-[0.3rem] text-[0.72rem] text-app-text">
                        #{index + 1}
                      </span>
                      {index === selectedFrame
                        ? (
                            [
                              "left",
                              "right",
                              "top",
                              "bottom",
                              "top-left",
                              "top-right",
                              "bottom-left",
                              "bottom-right",
                            ] as ResizeMode[]
                          ).map((mode) => (
                            <span
                              key={mode}
                              className={getHandleClass(mode)}
                              aria-hidden="true"
                              onPointerDown={(event) => startDrag(mode, event)}
                            />
                          ))
                        : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid min-h-80 place-items-center border border-app-border bg-app-raised p-5">
                <p className="m-0 max-w-[65ch] text-app-muted">
                  Upload a generated sprite sheet and the editor will show independent crop regions
                  here.
                </p>
              </div>
            )}

            <div className="grid gap-3">
              <div>
                <p className={eyebrowClass}>Frames</p>
                <h2 className="font-display text-[1.2rem] leading-[1.1] tracking-[-0.04em] text-app-text">
                  {frameCount} regions
                </h2>
              </div>

              <div
                className="frame-strip grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(6.25rem,1fr))]"
                role="listbox"
                aria-label="Sprite frames"
              >
                {regions.map((region, index) => (
                  <button
                    key={`frame-${index}`}
                    type="button"
                    className={`frame-card grid min-h-28 gap-2 border p-2 text-left transition enabled:hover:-translate-y-px ${
                      index === selectedFrame
                        ? "frame-card-active border-app-accent"
                        : "border-app-border bg-app-raised"
                    }`}
                    role="option"
                    aria-selected={index === selectedFrame}
                    aria-label={`Select frame ${index + 1}, ${getRegionSummary(region)}`}
                    onClick={() => {
                      setSelectedFrame(index);
                      setPlayhead(index);
                      setIsPlaying(false);
                    }}
                  >
                    <span className={eyebrowClass}>{String(index + 1).padStart(2, "0")}</span>
                    <span className="frame-well block aspect-square overflow-hidden">
                      {frameImageUrls[index] ? (
                        <img
                          src={frameImageUrls[index]}
                          alt=""
                          className="h-full w-full object-contain [image-rendering:pixelated]"
                        />
                      ) : (
                        <span className="block h-full w-full" />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={panelClass} aria-labelledby="preview-heading">
            <div className="grid gap-1">
              <p className={eyebrowClass}>Preview</p>
              <h2
                id="preview-heading"
                className="font-display text-[1.2rem] leading-[1.1] tracking-[-0.04em] text-app-text"
              >
                Game-ready export
              </h2>
            </div>

            <div className="preview-shell grid place-items-center overflow-hidden border border-app-border bg-app-raised p-4">
              {sourceImage && frameImageUrls[previewIndex] ? (
                <span
                  className="preview-frame frame-well block overflow-hidden"
                  style={{
                    aspectRatio: `${exportConfig.frameWidth} / ${exportConfig.frameHeight}`,
                  }}
                >
                  <img
                    src={frameImageUrls[previewIndex]}
                    alt=""
                    className="h-full w-full object-contain [image-rendering:pixelated]"
                  />
                </span>
              ) : (
                <p className="m-0 max-w-[65ch] text-app-muted">
                  Preview appears after you upload and split a source sheet.
                </p>
              )}
            </div>

            <label className={fieldClass}>
              <span className="text-[0.92rem] text-app-muted">Playback speed: {fps} fps</span>
              <input
                type="range"
                aria-label="Playback speed in frames per second"
                min="1"
                max="24"
                value={fps}
                onChange={(event) => setFps(Number(event.target.value))}
                className="w-full accent-app-accent"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className={`${fieldClass} col-span-2`}>
                <span className="text-[0.92rem] text-app-muted">SNES preset</span>
                <select
                  value={exportConfig.preset}
                  aria-label="SNES export preset"
                  onChange={(event) => applyExportPreset(event.target.value as ExportPreset)}
                  className={inputClass}
                >
                  <option value="snes-16">SNES 16x16</option>
                  <option value="snes-32">SNES 32x32</option>
                  <option value="snes-64">SNES 64x64</option>
                  <option value="snes-16x32">SNES 16x32</option>
                  <option value="snes-32x64">SNES 32x64</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              <label className={`${fieldClass} col-span-2`}>
                <span className="text-[0.92rem] text-app-muted">Export grid</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    aria-label="Export grid columns"
                    min="1"
                    value={exportConfig.columns}
                    onChange={(event) =>
                      updateExportConfig("columns", Math.max(1, Number(event.target.value)))
                    }
                    className={inputClass}
                  />
                  <input
                    type="number"
                    aria-label="Export grid rows"
                    min="1"
                    value={exportConfig.rows}
                    onChange={(event) =>
                      updateExportConfig("rows", Math.max(1, Number(event.target.value)))
                    }
                    className={inputClass}
                  />
                </div>
              </label>

              <label className={fieldClass}>
                <span className="text-[0.92rem] text-app-muted">Output width</span>
                <input
                  type="number"
                  aria-label="Output frame width"
                  min="1"
                  value={exportConfig.frameWidth}
                  onChange={(event) =>
                    setExportConfig((current) => ({
                      ...current,
                      frameWidth: Math.max(1, Number(event.target.value)),
                      preset: "custom",
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className={fieldClass}>
                <span className="text-[0.92rem] text-app-muted">Output height</span>
                <input
                  type="number"
                  aria-label="Output frame height"
                  min="1"
                  value={exportConfig.frameHeight}
                  onChange={(event) =>
                    setExportConfig((current) => ({
                      ...current,
                      frameHeight: Math.max(1, Number(event.target.value)),
                      preset: "custom",
                    }))
                  }
                  className={inputClass}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => setIsPlaying((current) => !current)}
                disabled={!sourceImage}
                aria-pressed={isPlaying}
              >
                {isPlaying ? "Pause preview" : "Play preview"}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setSelectedFrame(0);
                  setPlayhead(0);
                }}
                disabled={!sourceImage}
              >
                Reset
              </button>
            </div>

            <div className="grid gap-2">
              <button
                type="button"
                className={primaryButtonClass}
                onClick={exportSpriteSheet}
                disabled={!sourceImage}
              >
                Export packed sprite sheet
              </button>
              <button
                type="button"
                className={primaryButtonClass}
                onClick={exportGif}
                disabled={!sourceImage}
              >
                Export GIF
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={exportSelectedFrame}
                disabled={!sourceImage}
              >
                Export selected frame
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={exportMetadata}
                disabled={!sourceImage}
              >
                Export region metadata
              </button>
            </div>

            <p
              id="status-message"
              className="m-0 max-w-[65ch] text-app-muted"
              role="status"
              aria-live="polite"
            >
              {status}
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
