import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import zoomInIcon from './assets/zoom-in.svg';
import zoomOutIcon from './assets/zoom-out.svg';
import zoomResetIcon from './assets/zoom-reset.svg';
import { name, version } from '../package.json';
import { cubicBezier } from './utils';
import './ZoomPanControls.scss';

console.log(`${name} ${version}`);

function ZoomPanControls({
  minZoom,
  maxZoom,
  initialZoom,
  initialPan,
  targetZoom,
  targetPan,
  zoomFactor,
  children,
  onTransformChange,
  duration,
  controlsPosition,
}) {
  const [pan, setPan] = useState(initialPan);
  const [zoom, setZoom] = useState(initialZoom);
  const [startTouches, setStartTouches] = useState([]);
  const [initialPanRef, setInitialPanRef] = useState(initialPan);

  const velocityRef = useRef({ x: 0, y: 0 });
  const intertiaRef = useRef(); // tracks inertia animations
  const tweenRef = useRef(); // tracks tweened animations
  const pinchRef = useRef(null); // tracks multi-touch state

  const containerRef = useRef();
  const containerRectRef = useRef();
  const childrenRef = useRef();

  useEffect(() => {
    if (containerRef.current) {
      containerRectRef.current = containerRef.current.getBoundingClientRect();
    }
  }, []);

  useEffect(() => {
    onTransformChange({ zoom, pan });
  }, [zoom, pan]);

  const clampZoom = (z, min, max) => Math.min(Math.max(z, min), max);

  const applyPan = (newPan) => {
    const xMin = 0;
    const xMax = containerRef.current.offsetWidth - (10000 * zoom);
    const yMin = 0;
    const yMax = containerRef.current.offsetHeight - (2000 * zoom);
    newPan.x = Math.min(xMin, Math.max(xMax, newPan.x));
    newPan.y = Math.min(yMin, Math.max(yMax, newPan.y));
    setPan(newPan);
  };

  const tween = (start, end, callback, onComplete) => {
    const startTime = performance.now();

    const animate = (time) => {
      if (!tweenRef.current) return;

      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = cubicBezier(progress);
      const value = start + (end - start) * easedProgress;

      if (progress < 1) {
        tweenRef.current = requestAnimationFrame(animate);
      } else {
        tweenRef.current = null;
        if (onComplete) onComplete();
      }

      callback(value);
    };

    tweenRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (targetZoom !== undefined && targetZoom !== zoom) {
      tween(
        zoom,
        clampZoom(targetZoom, minZoom, maxZoom),
        setZoom,
      );
    }
  }, [targetZoom]);

  useEffect(() => {
    if (targetPan && (targetPan.x !== pan.x || targetPan.y !== pan.y)) {
      const startX = pan.x;
      const startY = pan.y;

      tween(
        0,
        1,
        (progress) => {
          const computedPan = {
            x: startX + (targetPan.x - startX) * progress,
            y: startY + (targetPan.y - startY) * progress,
          };
          // Enforce the x constraint
          applyPan(computedPan);
        },
      );
    }
  }, [targetPan]);

  const getTouches = (e) => Array.from(e.touches).map((touch) => ({
    x: touch.clientX - containerRectRef.current.left,
    y: touch.clientY - containerRectRef.current.top,
  }));

  // Compute the centroid and average distance for any number of touches.
  const computeMultiTouchData = (touches) => {
    const count = touches.length;
    const centroid = touches.reduce(
      (acc, t) => ({
        x: acc.x + t.x / count,
        y: acc.y + t.y / count,
      }),
      { x: 0, y: 0 },
    );
    const totalDistance = touches.reduce((acc, t) => {
      const dx = t.x - centroid.x;
      const dy = t.y - centroid.y;
      return acc + Math.hypot(dx, dy);
    }, 0);
    const avgDistance = totalDistance / count;
    return { centroid, avgDistance };
  };

  const handleTouchStart = (e) => {
    if (tweenRef.current) {
      cancelAnimationFrame(tweenRef.current);
      tweenRef.current = null;
    }
    if (intertiaRef.current) {
      cancelAnimationFrame(intertiaRef.current);
      intertiaRef.current = null;
    }

    const touches = getTouches(e);
    if (touches.length > 1) {
      // For multi-touch, initialize the gesture state using the centroid and average distance.
      const { centroid, avgDistance } = computeMultiTouchData(touches);
      pinchRef.current = {
        initialAvgDistance: avgDistance,
        initialZoom: zoom,
        initialPan: pan,
        initialCentroid: centroid,
      };
    } else if (touches.length === 1) {
      // Single-touch dragging.
      setStartTouches(touches);
      setInitialPanRef({ x: pan.x, y: pan.y });
      velocityRef.current = { x: 0, y: 0 };
    }
  };

  const handleTouchMove = (e) => {
    if (intertiaRef.current) {
      cancelAnimationFrame(intertiaRef.current);
      intertiaRef.current = null;
    }

    const touches = getTouches(e);

    if (touches.length > 1 && pinchRef.current) {
      // Multi-touch gesture: compute the new centroid and average distance.
      const { centroid: newCentroid, avgDistance: newAvgDistance } = computeMultiTouchData(touches);
      const scale = newAvgDistance / pinchRef.current.initialAvgDistance;
      const newZoom = clampZoom(pinchRef.current.initialZoom * scale, minZoom, maxZoom);
      const ratio = newZoom / pinchRef.current.initialZoom;
      // Adjust pan so that the image point under the initial centroid remains fixed.
      const newPan = {
        x: newCentroid.x - ratio * (pinchRef.current.initialCentroid.x - pinchRef.current.initialPan.x),
        y: newCentroid.y - ratio * (pinchRef.current.initialCentroid.y - pinchRef.current.initialPan.y),
      };

      setZoom(newZoom);
      applyPan(newPan);
    } else if (touches.length === 1) {
      // Single-touch drag.
      const dx = touches[0].x - startTouches[0].x;
      const dy = touches[0].y - startTouches[0].y;

      velocityRef.current = {
        x: dx - (pan.x - initialPanRef.x),
        y: dy - (pan.y - initialPanRef.y),
      };

      const newPan = {
        x: initialPanRef.x + dx,
        y: initialPanRef.y + dy,
      };
      applyPan(newPan);
    }
  };

  const handleTouchEnd = (e) => {
    const remainingTouches = e.touches.length;

    if (remainingTouches >= 2) {
      // Reinitialize multi-touch state with the remaining touches.
      const touches = getTouches(e);
      const { centroid, avgDistance } = computeMultiTouchData(touches);
      pinchRef.current = {
        initialAvgDistance: avgDistance,
        initialZoom: zoom,
        initialPan: pan,
        initialCentroid: centroid,
      };
    } else if (remainingTouches === 1) {
      // Transition to single-touch dragging.
      const touches = getTouches(e);
      setStartTouches(touches);
      setInitialPanRef({ x: pan.x, y: pan.y });
      pinchRef.current = null;
    } else {
      // No touches remain; clear state and start inertia for single-touch drag.
      pinchRef.current = null;
      setStartTouches([]);
      const inertia = () => {
        const dampen = 0.95;
        if (Math.abs(velocityRef.current.x) > 0.1 || Math.abs(velocityRef.current.y) > 0.1) {
          applyPan((prevPan) => {
            let newX = prevPan.x + velocityRef.current.x;
            let newY = prevPan.y + velocityRef.current.y;
            const xMin = 0;
            const xMax = containerRef.current.offsetWidth - (10000 * zoom);
            const yMin = 0;
            const yMax = containerRef.current.offsetHeight - (2000 * zoom);

            // If newX is too high (child too far right), clamp and reset x velocity.
            if (newX > xMin) {
              newX = xMin;
              velocityRef.current.x = 0;
            } else if (newX < xMax) {
              newX = xMax;
              velocityRef.current.x = 0;
            }

            // If newY is too high (child too far down), clamp and reset y velocity.
            if (newY > yMin) {
              newY = yMin;
              velocityRef.current.y = 0;
            } else if (newY < yMax) {
              newY = yMax;
              velocityRef.current.y = 0;
            }

            return { x: newX, y: newY };
          });

          // Only dampen if velocity hasn't been zeroed out by clamping.
          velocityRef.current.x *= dampen;
          velocityRef.current.y *= dampen;
          intertiaRef.current = requestAnimationFrame(inertia);
        } else {
          cancelAnimationFrame(intertiaRef.current);
          intertiaRef.current = null;
        }
      };

      // start inertia
      inertia();
    }
  };

  const handleWheel = (e) => {
    if (intertiaRef.current) {
      cancelAnimationFrame(intertiaRef.current);
      intertiaRef.current = null;
    }
    if (tweenRef.current) {
      cancelAnimationFrame(tweenRef.current);
      tweenRef.current = null;
    }

    const mouseX = e.clientX - containerRectRef.current.left;
    const mouseY = e.clientY - containerRectRef.current.top;

    const imageX = (mouseX - pan.x) / zoom;
    const imageY = (mouseY - pan.y) / zoom;

    const newZoom = clampZoom(zoom * (1 - e.deltaY * zoomFactor), minZoom, maxZoom);
    const newPanX = mouseX - imageX * newZoom;
    const newPanY = mouseY - imageY * newZoom;

    setZoom(newZoom);
    applyPan({ x: newPanX, y: newPanY });
  };

  const zoomIn = () => {
    const centerX = containerRectRef.current.width / 2;
    const centerY = containerRectRef.current.height / 2;
    const imageX = (centerX - pan.x) / zoom;
    const imageY = (centerY - pan.y) / zoom;

    tween(
      zoom,
      clampZoom(zoom * 2, minZoom, maxZoom),
      (value) => {
        const newPanX = centerX - imageX * value;
        const newPanY = centerY - imageY * value;
        setZoom(value);
        applyPan({ x: newPanX, y: newPanY });
      },
    );
  };

  const zoomOut = () => {
    const centerX = containerRectRef.current.width / 2;
    const centerY = containerRectRef.current.height / 2;
    const imageX = (centerX - pan.x) / zoom;
    const imageY = (centerY - pan.y) / zoom;

    tween(
      zoom,
      clampZoom(zoom / 2, minZoom, maxZoom),
      (value) => {
        const newPanX = centerX - imageX * value;
        const newPanY = centerY - imageY * value;
        setZoom(value);
        applyPan({ x: newPanX, y: newPanY });
      },
    );
  };

  const zoomReset = () => {
    const centerX = containerRectRef.current.width / 2;
    const centerY = containerRectRef.current.height / 2;
    const imageX = (centerX - pan.x) / zoom;
    const imageY = (centerY - pan.y) / zoom;

    tween(
      zoom,
      clampZoom(initialZoom, minZoom, maxZoom),
      (value) => {
        setZoom(value);
        const newPanX = centerX - imageX * value;
        const newPanY = centerY - imageY * value;
        applyPan({ x: newPanX, y: newPanY });
      },
    );
  };

  return (
    <div
      className="zoom-pan-controls"
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      <div
        ref={childrenRef}
        className="container"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {children}
      </div>
      <div className={`zoom-pan-controls-buttons ${controlsPosition}`}>
        <button type="button" onClick={zoomIn}>
          <img src={zoomInIcon} alt="Zoom In" />
        </button>
        <button type="button" onClick={zoomOut}>
          <img src={zoomOutIcon} alt="Zoom Out" />
        </button>
        <button type="button" onClick={zoomReset}>
          <img src={zoomResetIcon} alt="Reset Zoom" />
        </button>
      </div>
    </div>
  );
}

ZoomPanControls.defaultProps = {
  minZoom: 0.5,
  maxZoom: 2,
  initialZoom: 1,
  initialPan: { x: 0, y: 0 },
  targetZoom: undefined,
  targetPan: undefined,
  zoomFactor: 0.001,
  onTransformChange: () => { },
  duration: 1200,
  controlsPosition: 'bottom-left',
};

ZoomPanControls.propTypes = {
  minZoom: PropTypes.number,
  maxZoom: PropTypes.number,
  initialZoom: PropTypes.number,
  initialPan: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
  }),
  zoomFactor: PropTypes.number,
  targetZoom: PropTypes.number,
  targetPan: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
  }),
  onTransformChange: PropTypes.func,
  children: PropTypes.node.isRequired,
  duration: PropTypes.number,
  controlsPosition: PropTypes.string,
};

export default ZoomPanControls;
