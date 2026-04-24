import { useEffect, useMemo, useRef, useState } from "react";

type SliceConfig = {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  offsetX: number;
  offsetY: number;
  gapX: number;
  gapY: number;
};

type FrameAdjustment = {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

type LoadedImage = {
  name: string;
  src: string;
  width: number;
  height: number;
};

type ResizeMode =
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
  startDx: number;
  startDy: number;
  startDw: number;
  startDh: number;
};

type ExtractedFrame = {
  index: number;
  column: number;
  row: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

const DEFAULT_CONFIG: SliceConfig = {
  columns: 4,
  rows: 1,
  frameWidth: 256,
  frameHeight: 256,
  offsetX: 0,
  offsetY: 0,
  gapX: 0,
  gapY: 0,
};

const EMPTY_ADJUSTMENT: FrameAdjustment = {
  dx: 0,
  dy: 0,
  dw: 0,
  dh: 0,
};

const panelClass =
  "grid gap-4 border border-app-border bg-app-surface p-4 shadow-panel md:p-6";
const eyebrowClass =
  "m-0 text-[0.72rem] uppercase tracking-[0.18em] text-app-muted";
const fieldClass = "grid gap-2";
const inputClass =
  "min-h-11 border border-app-border/90 bg-app-raised px-3.5 py-3 text-app-text outline-none transition focus:border-app-accent focus:ring-2 focus:ring-app-accent/60";
const secondaryButtonClass =
  "min-h-11 border border-app-border bg-app-raised px-4 py-3 text-app-text transition enabled:hover:-translate-y-px enabled:hover:border-app-accent/70 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "min-h-11 border border-app-accent-strong bg-app-accent-strong px-4 py-3 text-app-ink transition enabled:hover:-translate-y-px enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";
const handleBaseClass = "absolute z-10 block bg-app-accent-strong";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createAdjustmentArray(length: number) {
  return Array.from({ length }, () => ({ ...EMPTY_ADJUSTMENT }));
}

function guessConfig(width: number, height: number): SliceConfig {
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

function getFrameImageUrl(image: HTMLImageElement, frame: ExtractedFrame) {
  const canvas = createCanvas(frame.sw, frame.sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    frame.sx,
    frame.sy,
    frame.sw,
    frame.sh,
    0,
    0,
    frame.sw,
    frame.sh,
  );
  return canvas.toDataURL("image/png");
}

function getSquareResize(
  mode: ResizeMode,
  deltaX: number,
  deltaY: number,
  start: FrameAdjustment,
) {
  switch (mode) {
    case "right": {
      const sizeDelta = deltaX;
      return {
        dx: start.dx,
        dy: start.dy,
        dw: start.dw + sizeDelta,
        dh: start.dh + sizeDelta,
      };
    }
    case "bottom": {
      const sizeDelta = deltaY;
      return {
        dx: start.dx,
        dy: start.dy,
        dw: start.dw + sizeDelta,
        dh: start.dh + sizeDelta,
      };
    }
    case "left": {
      const sizeDelta = -deltaX;
      return {
        dx: start.dx - sizeDelta,
        dy: start.dy,
        dw: start.dw + sizeDelta,
        dh: start.dh + sizeDelta,
      };
    }
    case "top": {
      const sizeDelta = -deltaY;
      return {
        dx: start.dx,
        dy: start.dy - sizeDelta,
        dw: start.dw + sizeDelta,
        dh: start.dh + sizeDelta,
      };
    }
    case "top-left": {
      const sizeDelta =
        Math.abs(deltaX) >= Math.abs(deltaY) ? -deltaX : -deltaY;
      return {
        dx: start.dx - sizeDelta,
        dy: start.dy - sizeDelta,
        dw: start.dw + sizeDelta,
        dh: start.dh + sizeDelta,
      };
    }
    case "top-right": {
      const sizeDelta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : -deltaY;
      return {
        dx: start.dx,
        dy: start.dy - sizeDelta,
        dw: start.dw + sizeDelta,
        dh: start.dh + sizeDelta,
      };
    }
    case "bottom-left": {
      const sizeDelta = Math.abs(deltaX) >= Math.abs(deltaY) ? -deltaX : deltaY;
      return {
        dx: start.dx - sizeDelta,
        dy: start.dy,
        dw: start.dw + sizeDelta,
        dh: start.dh + sizeDelta,
      };
    }
    case "bottom-right": {
      const sizeDelta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
      return {
        dx: start.dx,
        dy: start.dy,
        dw: start.dw + sizeDelta,
        dh: start.dh + sizeDelta,
      };
    }
  }
}

function getHandleClass(mode: ResizeMode) {
  switch (mode) {
    case "left":
      return `${handleBaseClass} -left-[3px] top-0 h-full w-[6px] cursor-ew-resize`;
    case "right":
      return `${handleBaseClass} -right-[3px] top-0 h-full w-[6px] cursor-ew-resize`;
    case "top":
      return `${handleBaseClass} -top-[3px] left-0 h-[6px] w-full cursor-ns-resize`;
    case "bottom":
      return `${handleBaseClass} -bottom-[3px] left-0 h-[6px] w-full cursor-ns-resize`;
    case "top-left":
      return `${handleBaseClass} -left-[5px] -top-[5px] h-3 w-3 cursor-nwse-resize shadow-[0_0_0_1px_color-mix(in_oklch,var(--color-app-ink)_20%,transparent)]`;
    case "top-right":
      return `${handleBaseClass} -right-[5px] -top-[5px] h-3 w-3 cursor-nesw-resize shadow-[0_0_0_1px_color-mix(in_oklch,var(--color-app-ink)_20%,transparent)]`;
    case "bottom-left":
      return `${handleBaseClass} -bottom-[5px] -left-[5px] h-3 w-3 cursor-nesw-resize shadow-[0_0_0_1px_color-mix(in_oklch,var(--color-app-ink)_20%,transparent)]`;
    case "bottom-right":
      return `${handleBaseClass} -bottom-[5px] -right-[5px] h-3 w-3 cursor-nwse-resize shadow-[0_0_0_1px_color-mix(in_oklch,var(--color-app-ink)_20%,transparent)]`;
  }
}

function App() {
  const sourceStageRef = useRef<HTMLDivElement | null>(null);
  const [sourceImage, setSourceImage] = useState<LoadedImage | null>(null);
  const [config, setConfig] = useState<SliceConfig>(DEFAULT_CONFIG);
  const [adjustments, setAdjustments] = useState<FrameAdjustment[]>(
    createAdjustmentArray(4),
  );
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [fps, setFps] = useState(8);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playhead, setPlayhead] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [frameImageUrls, setFrameImageUrls] = useState<string[]>([]);
  const [status, setStatus] = useState(
    "Upload a sprite sheet, dial in the slice grid, then refine any frame that is drifting.",
  );

  const frameCount = config.columns * config.rows;

  useEffect(() => {
    setAdjustments((current) => {
      if (current.length === frameCount) return current;
      return Array.from(
        { length: frameCount },
        (_, index) => current[index] ?? { ...EMPTY_ADJUSTMENT },
      );
    });
    setSelectedFrame((current) =>
      Math.min(current, Math.max(frameCount - 1, 0)),
    );
    setPlayhead((current) => Math.min(current, Math.max(frameCount - 1, 0)));
  }, [frameCount]);

  useEffect(() => {
    if (!isPlaying || frameCount < 2) {
      setPlayhead(selectedFrame);
      return;
    }

    const interval = window.setInterval(() => {
      setPlayhead((current) => (current + 1) % frameCount);
    }, 1000 / fps);

    return () => window.clearInterval(interval);
  }, [fps, frameCount, isPlaying, selectedFrame]);

  useEffect(() => {
    if (!dragState || !sourceImage) return;

    const activeDrag = dragState;
    const activeImage = sourceImage;

    function handlePointerMove(event: PointerEvent) {
      const rect = sourceStageRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;

      const deltaX = Math.round(
        (event.clientX - activeDrag.startX) * (activeImage.width / rect.width),
      );
      const deltaY = Math.round(
        (event.clientY - activeDrag.startY) *
          (activeImage.height / rect.height),
      );

      setAdjustments((current) =>
        current.map((adjustment, index) => {
          if (index !== selectedFrame) return adjustment;

          const next = getSquareResize(activeDrag.mode, deltaX, deltaY, {
            dx: activeDrag.startDx,
            dy: activeDrag.startDy,
            dw: activeDrag.startDw,
            dh: activeDrag.startDh,
          });

          const minTrim = 1 - Math.min(config.frameWidth, config.frameHeight);

          return {
            dx: next.dx,
            dy: next.dy,
            dw: Math.max(minTrim, next.dw),
            dh: Math.max(minTrim, next.dh),
          };
        }),
      );
    }

    function handlePointerUp() {
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    config.frameHeight,
    config.frameWidth,
    dragState,
    selectedFrame,
    sourceImage,
  ]);

  const frames = useMemo(() => {
    if (!sourceImage) return [];

    return Array.from({ length: frameCount }, (_, index) => {
      const column = index % config.columns;
      const row = Math.floor(index / config.columns);
      const adjustment = adjustments[index] ?? EMPTY_ADJUSTMENT;
      const baseX = config.offsetX + column * (config.frameWidth + config.gapX);
      const baseY = config.offsetY + row * (config.frameHeight + config.gapY);
      const sx = clamp(baseX + adjustment.dx, 0, sourceImage.width - 1);
      const sy = clamp(baseY + adjustment.dy, 0, sourceImage.height - 1);
      const sw = clamp(
        config.frameWidth + adjustment.dw,
        1,
        sourceImage.width - sx,
      );
      const sh = clamp(
        config.frameHeight + adjustment.dh,
        1,
        sourceImage.height - sy,
      );

      return { index, column, row, sx, sy, sw, sh };
    });
  }, [adjustments, config, frameCount, sourceImage]);

  const currentFrame = frames[selectedFrame] ?? null;
  const previewFrame = frames[isPlaying ? playhead : selectedFrame] ?? null;

  useEffect(() => {
    if (!sourceImage || frames.length === 0) {
      setFrameImageUrls([]);
      return;
    }

    const image = new Image();
    image.onload = () => {
      setFrameImageUrls(frames.map((frame) => getFrameImageUrl(image, frame)));
    };
    image.src = sourceImage.src;
  }, [frames, sourceImage]);

  function updateConfig<Key extends keyof SliceConfig>(
    key: Key,
    value: number,
  ) {
    setConfig((current) => ({
      ...current,
      [key]: Math.max(
        key === "offsetX" ||
          key === "offsetY" ||
          key === "gapX" ||
          key === "gapY"
          ? -9999
          : 1,
        value,
      ),
    }));
  }

  function updateAdjustment<Key extends keyof FrameAdjustment>(
    key: Key,
    value: number,
  ) {
    setAdjustments((current) =>
      current.map((adjustment, index) =>
        index === selectedFrame ? { ...adjustment, [key]: value } : adjustment,
      ),
    );
  }

  function resetSelectedAdjustment() {
    setAdjustments((current) =>
      current.map((adjustment, index) =>
        index === selectedFrame ? { ...EMPTY_ADJUSTMENT } : adjustment,
      ),
    );
    setStatus("Reset the crop offsets for the selected frame.");
  }

  function startResizeDrag(
    mode: ResizeMode,
    event: React.PointerEvent<HTMLSpanElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const adjustment = adjustments[selectedFrame] ?? EMPTY_ADJUSTMENT;
    setDragState({
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startDx: adjustment.dx,
      startDy: adjustment.dy,
      startDw: adjustment.dw,
      startDh: adjustment.dh,
    });
    setStatus("Drag any edge or corner to resize the crop freely.");
  }

  function applyUniformFrameSize() {
    if (!sourceImage) return;
    setConfig(guessConfig(sourceImage.width, sourceImage.height));
    setStatus(
      "Re-ran the automatic grid guess from the source sheet dimensions.",
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
        setSourceImage({
          name: file.name.replace(/\.[^.]+$/, ""),
          src: result,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        const nextConfig = guessConfig(image.naturalWidth, image.naturalHeight);
        setConfig(nextConfig);
        setAdjustments(
          createAdjustmentArray(nextConfig.columns * nextConfig.rows),
        );
        setSelectedFrame(0);
        setPlayhead(0);
        setStatus(
          `Loaded ${file.name}. Adjust the grid until every frame box hugs the sprite cleanly.`,
        );
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
  }

  async function exportSpriteSheet() {
    if (!sourceImage || frames.length === 0) return;

    const canvas = createCanvas(
      config.frameWidth * frames.length,
      config.frameHeight,
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    const image = new Image();
    image.src = sourceImage.src;

    await new Promise<void>((resolve) => {
      if (image.complete) {
        resolve();
        return;
      }
      image.onload = () => resolve();
    });

    frames.forEach((frame, index) => {
      ctx.clearRect(
        index * config.frameWidth,
        0,
        config.frameWidth,
        config.frameHeight,
      );
      ctx.drawImage(
        image,
        frame.sx,
        frame.sy,
        frame.sw,
        frame.sh,
        index * config.frameWidth,
        0,
        config.frameWidth,
        config.frameHeight,
      );
    });

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;

    downloadBlob(blob, `${sourceImage.name || "sprite"}-sliced-sheet.png`);
    setStatus("Exported a rebuilt sprite sheet using the current crop boxes.");
  }

  async function exportSelectedFrame() {
    if (!sourceImage || !currentFrame) return;

    const canvas = createCanvas(config.frameWidth, config.frameHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    const image = new Image();
    image.src = sourceImage.src;

    await new Promise<void>((resolve) => {
      if (image.complete) {
        resolve();
        return;
      }
      image.onload = () => resolve();
    });

    ctx.drawImage(
      image,
      currentFrame.sx,
      currentFrame.sy,
      currentFrame.sw,
      currentFrame.sh,
      0,
      0,
      config.frameWidth,
      config.frameHeight,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;

    downloadBlob(
      blob,
      `${sourceImage.name || "sprite"}-frame-${selectedFrame + 1}.png`,
    );
    setStatus("Exported the selected frame as a cleaned standalone sprite.");
  }

  function exportMetadata() {
    if (!sourceImage || frames.length === 0) return;

    const metadata = {
      source: sourceImage.name,
      frameRate: fps,
      outputFrame: { width: config.frameWidth, height: config.frameHeight },
      grid: config,
      frames: frames.map((frame) => ({
        index: frame.index,
        crop: { x: frame.sx, y: frame.sy, width: frame.sw, height: frame.sh },
      })),
    };

    downloadBlob(
      new Blob([JSON.stringify(metadata, null, 2)], {
        type: "application/json",
      }),
      `${sourceImage.name || "sprite"}-slice-data.json`,
    );
    setStatus("Exported crop metadata for the current slice setup.");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,color-mix(in_oklch,var(--color-app-accent)_10%,transparent),transparent_40%),var(--color-app-bg)] px-3 py-4 text-app-text md:px-4 md:py-6">
      <div className="mx-auto grid w-full max-w-360 gap-4">
        <header className="flex gap-6 border border-app-border bg-app-surface p-6 shadow-panel  lg:items-end grid-cols-2">
          <h1 className="font-display text-4xl leading-[0.98] tracking-[-0.04em] text-app-text sm:text-5xl lg:text-[3.8rem] flex">
            Cut messy generated sprite sheets into clean, previewable animation
            frames.
          </h1>
          <div className="grid gap-3 justify-end max-w-sm">
            <p className="m-0 max-w-[65ch] text-app-muted">
              Upload an image that already contains the sprite, place the
              slicing grid, fix the bad cuts frame by frame, and export a
              rebuilt sheet.
            </p>
            <label
              className={`${primaryButtonClass} relative inline-flex cursor-pointer items-center justify-center`}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileUpload}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <span>
                {sourceImage ? "Replace source sheet" : "Upload sprite sheet"}
              </span>
            </label>
          </div>
        </header>

        <main className="grid gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)_minmax(17rem,22rem)]">
          <section className={panelClass}>
            <div className="grid gap-1">
              <p className={eyebrowClass}>Grid</p>
              <h2 className="font-display text-[1.2rem] leading-[1.1] tracking-[-0.04em] text-app-text">
                Slice setup
              </h2>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
              {[
                ["Columns", config.columns, "columns"],
                ["Rows", config.rows, "rows"],
                ["Frame width", config.frameWidth, "frameWidth"],
                ["Frame height", config.frameHeight, "frameHeight"],
                ["Offset X", config.offsetX, "offsetX"],
                ["Offset Y", config.offsetY, "offsetY"],
                ["Gap X", config.gapX, "gapX"],
                ["Gap Y", config.gapY, "gapY"],
              ].map(([label, value, key]) => (
                <label key={String(key)} className={fieldClass}>
                  <span className="text-[0.92rem] text-app-muted">{label}</span>
                  <input
                    type="number"
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
                      updateConfig(
                        key as keyof SliceConfig,
                        Number(event.target.value),
                      )
                    }
                    className={inputClass}
                  />
                </label>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={applyUniformFrameSize}
                disabled={!sourceImage}
              >
                Auto-guess grid
              </button>
            </div>

            <div className="grid gap-1">
              <p className={eyebrowClass}>Per Frame</p>
              <h2 className="font-display text-[1.2rem] leading-[1.1] tracking-[-0.04em] text-app-text">
                Crop correction
              </h2>
            </div>

            <p className="m-0 max-w-[65ch] text-app-muted">
              Use these values to nudge the selected frame when one crop box is
              misaligned.
            </p>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
              {[
                ["Shift X", adjustments[selectedFrame]?.dx ?? 0, "dx"],
                ["Shift Y", adjustments[selectedFrame]?.dy ?? 0, "dy"],
                ["Width trim", adjustments[selectedFrame]?.dw ?? 0, "dw"],
                ["Height trim", adjustments[selectedFrame]?.dh ?? 0, "dh"],
              ].map(([label, value, key]) => (
                <label key={String(key)} className={fieldClass}>
                  <span className="text-[0.92rem] text-app-muted">{label}</span>
                  <input
                    type="number"
                    value={value}
                    onChange={(event) =>
                      updateAdjustment(
                        key as keyof FrameAdjustment,
                        Number(event.target.value),
                      )
                    }
                    className={inputClass}
                  />
                </label>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={resetSelectedAdjustment}
                disabled={!sourceImage}
              >
                Reset selected frame
              </button>
            </div>
          </section>

          <section className={panelClass}>
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <p className={eyebrowClass}>Source</p>
                <h2 className="font-display text-[1.2rem] leading-[1.1] tracking-[-0.04em] text-app-text">
                  {sourceImage
                    ? `${sourceImage.width} x ${sourceImage.height}`
                    : "Upload an image to start slicing"}
                </h2>
              </div>
              <p className="m-0 max-w-[65ch] text-app-muted">
                Every overlay box represents one extracted frame.
              </p>
            </div>

            {sourceImage ? (
              <div
                ref={sourceStageRef}
                className="relative border border-app-border bg-app-raised"
              >
                <img
                  src={sourceImage.src}
                  alt="Uploaded sprite sheet"
                  className="block h-auto w-full"
                />
                <div className="absolute inset-0">
                  {frames.map((frame) => (
                    <button
                      key={`overlay-${frame.index}`}
                      type="button"
                      className={`absolute m-0 overflow-visible border p-0 text-left shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-app-ink)_12%,transparent)] ${
                        frame.index === selectedFrame
                          ? "border-app-accent bg-[color-mix(in_oklch,var(--color-app-accent)_16%,var(--color-app-raised))]"
                          : "border-app-border bg-[color-mix(in_oklch,var(--color-app-accent)_12%,transparent)]"
                      }`}
                      style={{
                        left: `${(frame.sx / sourceImage.width) * 100}%`,
                        top: `${(frame.sy / sourceImage.height) * 100}%`,
                        width: `${(frame.sw / sourceImage.width) * 100}%`,
                        height: `${(frame.sh / sourceImage.height) * 100}%`,
                      }}
                      onClick={() => {
                        setSelectedFrame(frame.index);
                        setPlayhead(frame.index);
                        setIsPlaying(false);
                      }}
                    >
                      <span className="pointer-events-none absolute left-[0.35rem] top-[0.3rem] text-[0.72rem] text-app-text">
                        {frame.index + 1}
                      </span>
                      {frame.index === selectedFrame
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
                              onPointerDown={(event) =>
                                startResizeDrag(mode, event)
                              }
                            />
                          ))
                        : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid min-h-80 place-items-center border border-app-border bg-app-raised">
                <p className="m-0 max-w-[65ch] text-app-muted">
                  Upload a generated sprite sheet and the slicing controls will
                  appear here.
                </p>
              </div>
            )}

            <div className="grid gap-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className={eyebrowClass}>Frames</p>
                  <h2 className="font-display text-[1.2rem] leading-[1.1] tracking-[-0.04em] text-app-text">
                    {frameCount} slices
                  </h2>
                </div>
              </div>

              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(7rem,1fr))]">
                {frames.map((frame) => (
                  <button
                    key={`frame-${frame.index}`}
                    type="button"
                    className={`grid gap-2 border p-2 text-left transition enabled:hover:-translate-y-px ${
                      frame.index === selectedFrame
                        ? "border-app-accent bg-[color-mix(in_oklch,var(--color-app-accent)_16%,var(--color-app-raised))]"
                        : "border-app-border bg-app-raised"
                    }`}
                    onClick={() => {
                      setSelectedFrame(frame.index);
                      setPlayhead(frame.index);
                      setIsPlaying(false);
                    }}
                  >
                    <span className={eyebrowClass}>
                      {String(frame.index + 1).padStart(2, "0")}
                    </span>
                    <span className="block aspect-square overflow-hidden bg-[color-mix(in_oklch,var(--color-app-surface)_88%,var(--color-app-ink)_12%)]">
                      {frameImageUrls[frame.index] ? (
                        <img
                          src={frameImageUrls[frame.index]}
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

          <section className={panelClass}>
            <div className="grid gap-1">
              <p className={eyebrowClass}>Preview</p>
              <h2 className="font-display text-[1.2rem] leading-[1.1] tracking-[-0.04em] text-app-text">
                Animation check
              </h2>
            </div>

            <div className="grid min-h-80 place-items-center border border-app-border bg-app-raised p-4">
              {sourceImage && previewFrame ? (
                <span
                  className="block w-full max-w-[18rem] overflow-hidden bg-[color-mix(in_oklch,var(--color-app-surface)_88%,var(--color-app-ink)_12%)]"
                  style={{
                    aspectRatio: `${config.frameWidth} / ${config.frameHeight}`,
                  }}
                >
                  {frameImageUrls[previewFrame.index] ? (
                    <img
                      src={frameImageUrls[previewFrame.index]}
                      alt=""
                      className="h-full w-full object-contain [image-rendering:pixelated]"
                    />
                  ) : (
                    <span className="block h-full w-full" />
                  )}
                </span>
              ) : (
                <p className="m-0 max-w-[65ch] text-app-muted">
                  Playback preview appears after you upload a source sheet.
                </p>
              )}
            </div>

            <label className={fieldClass}>
              <span className="text-[0.92rem] text-app-muted">
                Preview speed: {fps} fps
              </span>
              <input
                type="range"
                min="1"
                max="24"
                value={fps}
                onChange={(event) => setFps(Number(event.target.value))}
                className="w-full accent-app-accent"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => setIsPlaying((current) => !current)}
                disabled={!sourceImage}
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
                Export new sprite sheet
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
                Export slice metadata
              </button>
            </div>

            <p className="m-0 max-w-[65ch] text-app-muted">{status}</p>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
