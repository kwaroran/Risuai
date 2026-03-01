<script lang="ts">
  import { language } from "src/lang";
  import CheckInput from "./CheckInput.svelte";
  import { onMount } from "svelte";

  interface Props {
    min?: number;
    max?: number;
    value: number;
    marginBottom?: boolean;
    step?: number;
    fixed?: number;
    multiple?: number;
    disableable?: boolean;
    customText?: string | undefined;
    onchange?: Function;
  }

  let {
    min = 0,
    max = 100,
    value = $bindable(),
    marginBottom = false,
    step = 1,
    fixed = 0,
    multiple = 1,
    disableable = false,
    customText = undefined,
    onchange,
  }: Props = $props();

  // DOM refs
  let slider: HTMLDivElement = $state();
  let rulerCanvas: HTMLCanvasElement = $state();

  // Core interaction state
  let mouseDown = $state(false);
  let isFineTuning = $state(false);
  let zoomLevel = $state(1);

  // Internal tracking (not reactive — no need to trigger re-renders)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let zoomTimer: ReturnType<typeof setInterval> | null = null;
  let fineTuneAnchorX = 0;
  let fineTuneAnchorValue = 0;
  let lastMoveTime = 0;
  let pointerDownX = 0;  // track initial press position for deadzone
  let lastRecordedX = 0; // for stationary detection in fine-tuning mode
  let lastTickValue = 0; // for haptic feedback on step boundaries

  // Derived display
  let fillPercent = $derived(
    Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  );

  let displayText = $derived(
    customText !== undefined
      ? customText
      : value === -1000 || value === undefined
        ? language.disabled
        : (value * multiple).toFixed(fixed)
  );

  // ─── Pointer handlers ───────────────────────────────────────

  function onDown(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    mouseDown = true;
    isFineTuning = false;
    zoomLevel = 1;
    pointerDownX = event.clientX;

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    // Set value immediately via absolute position
    setAbsoluteValue(event);

    // Start long-press detection
    startLongPressTimer(event.clientX);
  }

  function onMove(event: PointerEvent) {
    if (!mouseDown) return;
    event.preventDefault();
    event.stopPropagation();

    if (isFineTuning) {
      // Relative drag — value changes proportional to drag distance / screen width
      const deltaX = event.clientX - fineTuneAnchorX;
      const refWidth = window.innerWidth || 400;
      const sensitivity = 0.3 / Math.pow(2, zoomLevel - 1);
      const deltaValue = (deltaX / refWidth) * (max - min) * sensitivity;

      // Adaptive step: at higher zoom, allow finer increments
      const effectiveStep = getEffectiveStep();

      let newValue = fineTuneAnchorValue + deltaValue;
      newValue = Math.round(newValue / effectiveStep) * effectiveStep;
      const clamped = clamp(newValue);

      // Haptic tick on each step boundary crossed
      if (clamped !== lastTickValue) {
        lastTickValue = clamped;
        try { navigator.vibrate?.(10); } catch {}
      }
      value = clamped;

      // Only count as "movement" if pointer actually moved significantly
      // This prevents mobile micro-jitter from blocking stationary zoom
      if (Math.abs(event.clientX - lastRecordedX) > 3) {
        lastMoveTime = Date.now();
        lastRecordedX = event.clientX;
      }
      drawRuler();
    } else {
      // Normal mode — only treat as drag if moved significantly from press origin
      const drift = Math.abs(event.clientX - pointerDownX);
      if (drift > 10) {
        // User is intentionally dragging, not long-pressing
        setAbsoluteValue(event);
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
      // If drift <= 10, do nothing — let long-press timer continue
    }
  }

  function onUp(event: PointerEvent) {
    cleanup();
    try {
      (event.currentTarget as HTMLElement)?.releasePointerCapture(event.pointerId);
    } catch {}
  }

  function onLostCapture() {
    cleanup();
  }

  function cleanup() {
    mouseDown = false;
    isFineTuning = false;
    zoomLevel = 1;
    clearTimers();
  }

  // ─── Value calculation ──────────────────────────────────────

  function setAbsoluteValue(event: PointerEvent) {
    if (!slider) return;
    const rect = slider.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let newValue = (x / rect.width) * (max - min) + min;
    newValue = Math.round(newValue / step) * step;
    value = clamp(newValue);
  }

  function clamp(v: number): number {
    return Math.min(Math.max(v, min), max);
  }

  // Build a descending ladder of "nice" step values: 200 → 100 → 50 → 20 → 10 → 5 → 2 → 1
  // Uses standard 1-2-5 intervals per decimal magnitude
  function getEffectiveStep(): number {
    if (zoomLevel <= 1) return step;

    // Walk down the nice-step ladder, one step per full zoom level
    let current = step;
    const stepsToTake = Math.floor(zoomLevel - 1);
    const minAllowed = step >= 1 ? 1 : Math.pow(10, -(fixed + 1));

    for (let i = 0; i < stepsToTake; i++) {
      const next = nextSmallerNiceStep(current);
      if (next < minAllowed) { current = minAllowed; break; }
      current = next;
    }
    return current;
  }

  // Given a step value, return the next smaller "nice" number
  // Sequence per decade: ...1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1...
  function nextSmallerNiceStep(s: number): number {
    if (s <= 0) return s;
    const magnitude = Math.pow(10, Math.floor(Math.log10(s)));
    const normalized = s / magnitude; // will be in [1, 10)

    if (normalized > 5) return 5 * magnitude;
    if (normalized > 2) return 2 * magnitude;
    if (normalized > 1) return 1 * magnitude;
    // normalized ≈ 1 → drop to previous decade
    return 5 * (magnitude / 10);
  }

  // ─── Long press & zoom timers ───────────────────────────────

  function clearTimers() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (zoomTimer) {
      clearInterval(zoomTimer);
      zoomTimer = null;
    }
  }

  function startLongPressTimer(clientX: number) {
    if (longPressTimer) clearTimeout(longPressTimer);

    longPressTimer = setTimeout(() => {
      if (!mouseDown) return;

      // Enter fine-tuning mode
      isFineTuning = true;
      zoomLevel = 1;
      fineTuneAnchorX = clientX;
      fineTuneAnchorValue = value;
      lastMoveTime = Date.now();
      lastRecordedX = clientX;
      lastTickValue = value;

      // Haptic feedback
      try { navigator.vibrate?.(30); } catch {}

      // Start the stationary zoom: every 500ms, if user hasn't moved for 400ms, increase zoom
      startZoomTimer();

      // Initial ruler draw
      requestAnimationFrame(() => drawRuler());
    }, 400);
  }

  function startZoomTimer() {
    if (zoomTimer) clearInterval(zoomTimer);

    zoomTimer = setInterval(() => {
      if (!isFineTuning || !mouseDown) {
        clearInterval(zoomTimer!);
        zoomTimer = null;
        return;
      }

      const elapsed = Date.now() - lastMoveTime;
      // If user has been stationary for > 400ms, zoom in one step
      if (elapsed > 400 && zoomLevel < 8) {
        zoomLevel = Math.min(8, zoomLevel + 1);
        // Re-anchor BOTH position and value so sensitivity change doesn't cause a jump
        fineTuneAnchorX = lastRecordedX;
        fineTuneAnchorValue = value;
        // Reset lastMoveTime so next zoom requires another 400ms of stillness
        lastMoveTime = Date.now();
        drawRuler();
      }
    }, 500);
  }

  // ─── Canvas ruler rendering ─────────────────────────────────

  function drawRuler() {
    if (!rulerCanvas || !isFineTuning) return;

    const canvas = rulerCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size canvas to container
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Calculate the visible value range at current zoom
    // At zoom 1, we see the full range. At zoom 8, we see ~1/30th of it.
    const visibleRange = (max - min) / Math.pow(1.4, zoomLevel - 1);
    const centerValue = value;
    const rangeStart = centerValue - visibleRange / 2;

    // Determine nice tick spacing
    const tickStep = getNiceTickStep(visibleRange, w);

    // First tick value (aligned to tickStep)
    const firstTick = Math.ceil(rangeStart / tickStep) * tickStep;

    // Draw ticks
    const majorEvery = 5; // every 5th tick is major
    let tickIndex = 0;
    for (let v = firstTick; v <= rangeStart + visibleRange; v += tickStep) {
      const x = ((v - rangeStart) / visibleRange) * w;
      if (x < -5 || x > w + 5) continue;

      const isMajor = Math.abs(Math.round(v / tickStep) % majorEvery) === 0;
      const tickH = isMajor ? h * 0.8 : h * 0.4;

      // Fade ticks near edges
      const edgeDist = Math.min(x, w - x);
      const alpha = Math.min(1, edgeDist / 30) * 0.6;

      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = isMajor ? 1.5 : 0.75;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - tickH);
      ctx.stroke();

      tickIndex++;
    }

    // Draw center indicator — a thin bright line
    const centerX = w / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, h);
    ctx.stroke();
  }

  function getNiceTickStep(visibleRange: number, widthPx: number): number {
    // Target: ~1 tick per 12-20px for readability
    const desiredTicks = widthPx / 16;
    const rawStep = visibleRange / desiredTicks;

    // Snap to a "nice" step: 1, 2, 5, 10, 20, 50, ...
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;

    let niceNorm: number;
    if (normalized <= 1.5) niceNorm = 1;
    else if (normalized <= 3.5) niceNorm = 2;
    else if (normalized <= 7.5) niceNorm = 5;
    else niceNorm = 10;

    const niceStep = niceNorm * magnitude;
    // Ensure tick step is at least the slider's own step
    return Math.max(niceStep, step);
  }

  // Redraw ruler whenever zoomLevel changes reactively
  $effect(() => {
    if (isFineTuning && zoomLevel) {
      requestAnimationFrame(() => drawRuler());
    }
  });
</script>

<!-- Backdrop blur overlay — placed at body level via fixed positioning -->
{#if isFineTuning}
  <div
    class="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
    style="pointer-events: none;"
  ></div>
{/if}

<div class="w-full flex" class:mb-4={marginBottom}>
  {#if disableable}
    <div
      class="relative h-8 border-darkborderc border rounded-full cursor-pointer rounded-r-none border-r-0 flex justify-center items-center pl-2"
    >
      <CheckInput
        check={value !== -1000 && value !== undefined}
        margin={false}
        onChange={(c) => {
          onchange?.();
          if (c) {
            value = min;
          } else {
            value = -1000;
          }
        }}
      ></CheckInput>
    </div>
  {/if}

  <!-- The slider track -->
  <div
    class="relative w-full border-darkborderc border rounded-full cursor-pointer select-none touch-none overflow-hidden transition-all duration-200 ease-out"
    class:rounded-l-none={disableable}
    class:z-50={isFineTuning}
    style:height={isFineTuning ? "3.5rem" : "2rem"}
    style:box-shadow={isFineTuning
      ? "0 0 20px rgba(0,0,0,0.4), 0 0 60px rgba(0,0,0,0.1)"
      : "none"}
    style:background={`linear-gradient(to right, var(--risu-theme-darkbutton) 0%, var(--risu-theme-darkbutton) ${fillPercent}%, var(--risu-theme-darkbg) ${fillPercent}%, var(--risu-theme-darkbg) 100%)`}
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onlostpointercapture={onLostCapture}
    bind:this={slider}
  >
    <!-- Value display -->
    <span
      class="absolute left-3 top-0 flex items-center text-textcolor text-sm transition-all duration-200 pointer-events-none"
      style:height={isFineTuning ? "1.75rem" : "2rem"}
      style:font-weight={isFineTuning ? "600" : "400"}
    >
      {displayText}
      {#if isFineTuning}
        <span class="ml-1.5 text-xs opacity-50 font-normal">×{zoomLevel.toFixed(0)}</span>
      {/if}
    </span>

    <!-- Canvas ruler (only rendered during fine-tuning) -->
    {#if isFineTuning}
      <div class="absolute bottom-0 left-0 w-full pointer-events-none" style="height: 1.75rem;">
        <canvas
          bind:this={rulerCanvas}
          class="w-full h-full"
          style="display: block;"
        ></canvas>
      </div>
    {/if}
  </div>
</div>