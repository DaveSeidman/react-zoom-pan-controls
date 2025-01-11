import React, { useState, useRef, useEffect } from 'react';

export default function ZoomPanControls({
  minZoom = 0.25,
  maxZoom = 2,
  initialZoom = 1,
  initialPan = { x: 0, y: 0 },
  targetZoom,             // optional forced zoom
  targetPan,              // optional forced pan
  onAnimationEnd,         // optional callback after tween
  children,
  style = {},             // extra style on the outer container
}) {

  const [pan, setPan] = useState(initialPan);
  const [zoom, setZoom] = useState(initialZoom);


  const [touchMode, setTouchMode] = useState(null);
  const [startTouches, setStartTouches] = useState([]);
  const [startMidpoint, setStartMidpoint] = useState({ x: 0, y: 0 });
  const [initialPanRef, setInitialPanRef] = useState({ x: 0, y: 0 });
  const [initialZoomRef, setInitialZoomRef] = useState(initialZoom);


  const velocity = useRef({ x: 0, y: 0 });
  const lastPan = useRef({ x: 0, y: 0 });
  const lastTimestamp = useRef(0);
  const inertiaAnimationRef = useRef(null);

  // Container ref
  const containerRef = useRef(null);

  // Track if we're mid-tween, so we can block pinch/zoom/pan events
  const [tweening, setTweening] = useState(false);

  // Easing function
  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;


  useEffect(() => {
    // If user did not pass these props, or if we're already animating something else
    // just skip.
    if (targetZoom === undefined && targetPan === undefined) return;
    if (tweening) return;

    // We'll animate from the current (zoom, pan) to the target(s).
    const startZoom = zoom;
    const startPanLocal = { ...pan };
    const endZoom = clampZoom(
      targetZoom !== undefined ? targetZoom : zoom,
      minZoom,
      maxZoom
    );

    const endPan = targetPan !== undefined ? targetPan : { ...pan };
    console.log(endPan);

    const duration = 600;
    const startTime = performance.now();

    setTweening(true);

    function animateStep(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(progress);

      const interpolatedZoom = startZoom + (endZoom - startZoom) * eased;
      const interpolatedPan = {
        x: startPanLocal.x + (endPan.x - startPanLocal.x) * eased,
        y: startPanLocal.y + (endPan.y - startPanLocal.y) * eased,
      };

      // console.log(interpolatedPan)

      setZoom(interpolatedZoom);
      setPan(interpolatedPan);

      if (progress < 1) {
        requestAnimationFrame(animateStep);
      } else {
        setTweening(false);
        if (typeof onAnimationEnd === 'function') {
          onAnimationEnd({ zoom: endZoom, pan: endPan });
        }
      }
    }

    requestAnimationFrame(animateStep);
  }, [targetZoom, targetPan]);


  function clampZoom(z, min, max) {
    return Math.min(Math.max(z, min), max);
  }

  function getTouches(e) {
    // If we are tweening to a forced transform, skip user interaction
    if (tweening) return [];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return [];
    return Array.from(e.touches).map((touch) => ({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }));
  }

  function applyInertia() {
    if (tweening) return;
    const deceleration = 0.975;
    const threshold = 0.01;

    if (
      Math.abs(velocity.current.x) < threshold &&
      Math.abs(velocity.current.y) < threshold
    ) {
      cancelAnimationFrame(inertiaAnimationRef.current);
      return;
    }

    velocity.current.x *= deceleration;
    velocity.current.y *= deceleration;

    setPan((prev) => ({
      x: prev.x + velocity.current.x,
      y: prev.y + velocity.current.y,
    }));

    inertiaAnimationRef.current = requestAnimationFrame(applyInertia);
  }


  function handleWheel(e) {
    // If tweening, skip user interaction
    if (tweening) return;
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const imageX = (mouseX - pan.x) / zoom;
    const imageY = (mouseY - pan.y) / zoom;

    const zoomFactor = 0.001;
    const newZoom = clampZoom(zoom * (1 - e.deltaY * zoomFactor), minZoom, maxZoom);

    const newPanX = mouseX - imageX * newZoom;
    const newPanY = mouseY - imageY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }


  function handleTouchStart(e) {
    if (tweening) return;

    if (e.touches.length === 1) {
      setTouchMode('pan');
      const currentTouches = getTouches(e);
      setStartTouches(currentTouches);
      setInitialPanRef({ x: pan.x, y: pan.y });
      velocity.current = { x: 0, y: 0 };
      lastPan.current = { x: pan.x, y: pan.y };
      lastTimestamp.current = performance.now();
    } else if (e.touches.length === 2) {
      setTouchMode('pinch');
      const currentTouches = getTouches(e);
      setStartTouches(currentTouches);
      setInitialZoomRef(zoom);
      setInitialPanRef({ x: pan.x, y: pan.y });

      const midpoint = {
        x: (currentTouches[0].x + currentTouches[1].x) / 2,
        y: (currentTouches[0].y + currentTouches[1].y) / 2,
      };
      setStartMidpoint(midpoint);
    }
  }

  function handleTouchMove(e) {
    if (tweening) return;
    if (!touchMode) return;

    const currentTouches = getTouches(e);

    // Pan
    if (touchMode === 'pan' && currentTouches.length === 1) {
      const dx = currentTouches[0].x - startTouches[0].x;
      const dy = currentTouches[0].y - startTouches[0].y;
      const newPan = {
        x: initialPanRef.x + dx,
        y: initialPanRef.y + dy,
      };

      const now = performance.now();
      const deltaTime = now - lastTimestamp.current;
      velocity.current = {
        x: (newPan.x - lastPan.current.x) / deltaTime,
        y: (newPan.y - lastPan.current.y) / deltaTime,
      };

      lastPan.current = newPan;
      lastTimestamp.current = now;

      setPan(newPan);
    }
    // Pinch
    else if (touchMode === 'pinch' && currentTouches.length === 2) {
      const startDist = Math.hypot(
        startTouches[1].x - startTouches[0].x,
        startTouches[1].y - startTouches[0].y
      );
      const currentDist = Math.hypot(
        currentTouches[1].x - currentTouches[0].x,
        currentTouches[1].y - currentTouches[0].y
      );
      const scaleChange = currentDist / startDist;

      const newZoomVal = clampZoom(initialZoomRef * scaleChange, minZoom, maxZoom);

      const newMidpoint = {
        x: (currentTouches[0].x + currentTouches[1].x) / 2,
        y: (currentTouches[0].y + currentTouches[1].y) / 2,
      };

      const dxMid = newMidpoint.x - startMidpoint.x;
      const dyMid = newMidpoint.y - startMidpoint.y;

      const anchorX = (startMidpoint.x - initialPanRef.x) / initialZoomRef;
      const anchorY = (startMidpoint.y - initialPanRef.y) / initialZoomRef;

      const scaledAnchorX = anchorX * newZoomVal;
      const scaledAnchorY = anchorY * newZoomVal;

      const newPanX =
        initialPanRef.x + dxMid - (scaledAnchorX - anchorX * initialZoomRef);
      const newPanY =
        initialPanRef.y + dyMid - (scaledAnchorY - anchorY * initialZoomRef);

      setZoom(newZoomVal);
      setPan({ x: newPanX, y: newPanY });
    }
  }

  function handleTouchEnd(e) {
    if (tweening) return;
    if (touchMode === 'pan' && e.touches.length === 0) {
      lastTimestamp.current = performance.now();
      lastPan.current = pan;
      inertiaAnimationRef.current = requestAnimationFrame(applyInertia);
    }
    setTouchMode(null);
    setStartTouches([]);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [pan, zoom]);

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
  };

  return (
    <div
      className='transform-container'
      ref={containerRef}
      style={{
        overflow: 'hidden',
        touchAction: 'none',
        position: 'relative',
        width: '100%',
        height: '100%',
        ...style,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div style={transformStyle}>
        {children}
      </div>
    </div>
  );
}