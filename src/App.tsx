import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

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

function getFrameImageUrl(
  image: HTMLImageElement,
  frame: { sx: number; sy: number; sw: number; sh: number },
) {
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

      return {
        index,
        column,
        row,
        sx,
        sy,
        sw,
        sh,
      };
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
    setStatus(
      "Drag any edge or corner. The crop stays locked to a 1:1 ratio while resizing.",
    );
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

      const image = new Image();
      image.onload = () => {
        setSourceImage({
          name: file.name.replace(/\.[^.]+$/, ""),
          src: reader.result as string,
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
      image.src = reader.result;
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
      outputFrame: {
        width: config.frameWidth,
        height: config.frameHeight,
      },
      grid: config,
      frames: frames.map((frame) => ({
        index: frame.index,
        crop: {
          x: frame.sx,
          y: frame.sy,
          width: frame.sw,
          height: frame.sh,
        },
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
    <div className="app-shell">
      <header className="hero-bar">
        <div>
          <p className="eyebrow">Sprite Slicer</p>
          <h1>
            Cut messy generated sprite sheets into clean, previewable animation
            frames.
          </h1>
        </div>
        <div className="hero-copy">
          <p>
            Upload an image that already contains the sprite, place the slicing
            grid, fix the bad cuts frame by frame, and export a rebuilt sheet.
          </p>
          <label className="upload-field primary-upload">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFileUpload}
            />
            <span>
              {sourceImage ? "Replace source sheet" : "Upload sprite sheet"}
            </span>
          </label>
        </div>
      </header>

      <main className="studio-grid">
        <section className="panel control-panel">
          <div className="panel-heading">
            <p className="panel-label">Grid</p>
            <h2>Slice setup</h2>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Columns</span>
              <input
                type="number"
                min="1"
                value={config.columns}
                onChange={(event) =>
                  updateConfig("columns", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Rows</span>
              <input
                type="number"
                min="1"
                value={config.rows}
                onChange={(event) =>
                  updateConfig("rows", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Frame width</span>
              <input
                type="number"
                min="1"
                value={config.frameWidth}
                onChange={(event) =>
                  updateConfig("frameWidth", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Frame height</span>
              <input
                type="number"
                min="1"
                value={config.frameHeight}
                onChange={(event) =>
                  updateConfig("frameHeight", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Offset X</span>
              <input
                type="number"
                value={config.offsetX}
                onChange={(event) =>
                  updateConfig("offsetX", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Offset Y</span>
              <input
                type="number"
                value={config.offsetY}
                onChange={(event) =>
                  updateConfig("offsetY", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Gap X</span>
              <input
                type="number"
                value={config.gapX}
                onChange={(event) =>
                  updateConfig("gapX", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Gap Y</span>
              <input
                type="number"
                value={config.gapY}
                onChange={(event) =>
                  updateConfig("gapY", Number(event.target.value))
                }
              />
            </label>
          </div>

          <div className="compact-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={applyUniformFrameSize}
              disabled={!sourceImage}
            >
              Auto-guess grid
            </button>
          </div>

          <div className="panel-heading">
            <p className="panel-label">Per frame</p>
            <h2>Crop correction</h2>
          </div>

          <p className="hint">
            Use these values to nudge the selected frame when one crop box is
            misaligned.
          </p>

          <div className="field-grid">
            <label className="field">
              <span>Shift X</span>
              <input
                type="number"
                value={adjustments[selectedFrame]?.dx ?? 0}
                onChange={(event) =>
                  updateAdjustment("dx", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Shift Y</span>
              <input
                type="number"
                value={adjustments[selectedFrame]?.dy ?? 0}
                onChange={(event) =>
                  updateAdjustment("dy", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Width trim</span>
              <input
                type="number"
                value={adjustments[selectedFrame]?.dw ?? 0}
                onChange={(event) =>
                  updateAdjustment("dw", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Height trim</span>
              <input
                type="number"
                value={adjustments[selectedFrame]?.dh ?? 0}
                onChange={(event) =>
                  updateAdjustment("dh", Number(event.target.value))
                }
              />
            </label>
          </div>

          <div className="compact-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={resetSelectedAdjustment}
              disabled={!sourceImage}
            >
              Reset selected frame
            </button>
          </div>
        </section>

        <section className="panel workspace-panel">
          <div className="panel-heading workspace-heading">
            <div>
              <p className="panel-label">Source</p>
              <h2>
                {sourceImage
                  ? `${sourceImage.width} x ${sourceImage.height}`
                  : "Upload an image to start slicing"}
              </h2>
            </div>
            <p className="hint">
              Every overlay box represents one extracted frame.
            </p>
          </div>

          {sourceImage ? (
            <div className="source-stage" ref={sourceStageRef}>
              <img
                src={sourceImage.src}
                alt="Uploaded sprite sheet"
                className="source-image"
              />
              <div className="source-overlay">
                {frames.map((frame) => (
                  <button
                    key={`overlay-${frame.index}`}
                    type="button"
                    className={
                      frame.index === selectedFrame
                        ? "slice-box active"
                        : "slice-box"
                    }
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
                    <span className="slice-box-label">{frame.index + 1}</span>
                    {frame.index === selectedFrame ? (
                      <>
                        <span
                          className="resize-handle resize-handle-left"
                          onPointerDown={(event) =>
                            startResizeDrag("left", event)
                          }
                        />
                        <span
                          className="resize-handle resize-handle-right"
                          onPointerDown={(event) =>
                            startResizeDrag("right", event)
                          }
                        />
                        <span
                          className="resize-handle resize-handle-top"
                          onPointerDown={(event) =>
                            startResizeDrag("top", event)
                          }
                        />
                        <span
                          className="resize-handle resize-handle-bottom"
                          onPointerDown={(event) =>
                            startResizeDrag("bottom", event)
                          }
                        />
                        <span
                          className="resize-handle resize-handle-top-left"
                          onPointerDown={(event) =>
                            startResizeDrag("top-left", event)
                          }
                        />
                        <span
                          className="resize-handle resize-handle-top-right"
                          onPointerDown={(event) =>
                            startResizeDrag("top-right", event)
                          }
                        />
                        <span
                          className="resize-handle resize-handle-bottom-left"
                          onPointerDown={(event) =>
                            startResizeDrag("bottom-left", event)
                          }
                        />
                        <span
                          className="resize-handle resize-handle-bottom-right"
                          onPointerDown={(event) =>
                            startResizeDrag("bottom-right", event)
                          }
                        />
                      </>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>
                Upload a generated sprite sheet and the slicing controls will
                appear here.
              </p>
            </div>
          )}

          <div className="timeline">
            <div className="timeline-header">
              <div>
                <p className="panel-label">Frames</p>
                <h2>{frameCount} slices</h2>
              </div>
            </div>

            <div className="frame-strip">
              {frames.map((frame) => (
                <button
                  key={`frame-${frame.index}`}
                  type="button"
                  className={
                    frame.index === selectedFrame
                      ? "frame-card active"
                      : "frame-card"
                  }
                  onClick={() => {
                    setSelectedFrame(frame.index);
                    setPlayhead(frame.index);
                    setIsPlaying(false);
                  }}
                >
                  <span className="frame-number">
                    {String(frame.index + 1).padStart(2, "0")}
                  </span>
                  <span className="frame-thumb-shell">
                    {frameImageUrls[frame.index] ? (
                      <img
                        src={frameImageUrls[frame.index]}
                        alt=""
                        className="frame-thumb"
                      />
                    ) : (
                      <span className="frame-thumb placeholder" />
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <p className="panel-label">Preview</p>
            <h2>Animation check</h2>
          </div>

          <div className="preview-stage">
            {sourceImage && previewFrame ? (
              <span
                className="preview-frame-shell"
                style={{
                  aspectRatio: `${config.frameWidth} / ${config.frameHeight}`,
                }}
              >
                {frameImageUrls[previewFrame.index] ? (
                  <img
                    src={frameImageUrls[previewFrame.index]}
                    alt=""
                    className="preview-frame"
                  />
                ) : (
                  <span className="preview-frame placeholder" />
                )}
              </span>
            ) : (
              <p className="hint">
                Playback preview appears after you upload a source sheet.
              </p>
            )}
          </div>

          <label className="field">
            <span>Preview speed: {fps} fps</span>
            <input
              type="range"
              min="1"
              max="24"
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
            />
          </label>

          <div className="compact-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => setIsPlaying((current) => !current)}
              disabled={!sourceImage}
            >
              {isPlaying ? "Pause preview" : "Play preview"}
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setSelectedFrame(0);
                setPlayhead(0);
              }}
              disabled={!sourceImage}
            >
              Reset
            </button>
          </div>

          <div className="export-stack">
            <button
              type="button"
              className="primary-action"
              onClick={exportSpriteSheet}
              disabled={!sourceImage}
            >
              Export new sprite sheet
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={exportSelectedFrame}
              disabled={!sourceImage}
            >
              Export selected frame
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={exportMetadata}
              disabled={!sourceImage}
            >
              Export slice metadata
            </button>
          </div>

          <p className="status-copy">{status}</p>
        </section>
      </main>
    </div>
  );
}

export default App;
