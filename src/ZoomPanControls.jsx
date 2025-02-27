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
  targetZoom, // pass in a target zoom to tween to it
  targetPan, // pass in a target pan to tween to it
  zoomFactor,
  children,
  onTransformChange,
  duration, // tween duration
}) {
  const [pan, setPan] = useState(initialPan);
  const [zoom, setZoom] = useState(initialZoom);
  const [touchMode, setTouchMode] = useState(null);
  const [startTouches, setStartTouches] = useState([]);
  const [initialPanRef, setInitialPanRef] = useState(initialPan);
  const velocityRef = useRef({ x: 0, y: 0 });
  const intertiaRef = useRef(null); // tracks inertia animations
  const tweenRef = useRef(null); // track tweened animations

  const containerRef = useRef(null);

  useEffect(() => {
    onTransformChange({ zoom, pan });
  }, [zoom, pan, onTransformChange]);

  const clampZoom = (z, min, max) => Math.min(Math.max(z, min), max);

  const tween = (start, end, callback, onComplete) => {
    const startTime = performance.now();

    const animate = (time) => {
      if (!tweenRef.current) return;

      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = cubicBezier(progress);
      const value = start + (end - start) * easedProgress;

      callback(value);

      if (progress < 1) {
        tweenRef.current = requestAnimationFrame(animate);
      } else {
        tweenRef.current = null;
        if (onComplete) onComplete();
      }
    };

    tweenRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (targetZoom !== undefined && targetZoom !== zoom) {
      tween(
        zoom,
        clampZoom(targetZoom, minZoom, maxZoom),
        setZoom,
        () => {
        },
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
          setPan({
            x: startX + (targetPan.x - startX) * progress,
            y: startY + (targetPan.y - startY) * progress,
          });
        },
        () => {
          // setTweening(false);
        },
      );
    }
  }, [targetPan]);

  const getTouches = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return [];
    return Array.from(e.touches).map((touch) => ({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }));
  };

  const handleTouchStart = (e) => {
    if (tweenRef.current) {
      cancelAnimationFrame(tweenRef.current); // ✅ Cancel tween animation
      tweenRef.current = null;
    }

    if (intertiaRef.current) {
      cancelAnimationFrame(intertiaRef.current); // ✅ Stop inertia animation
    }

    if (e.touches.length === 1) {
      setTouchMode('pan');
      const currentTouches = getTouches(e);
      setStartTouches(currentTouches);
      setInitialPanRef({ x: pan.x, y: pan.y });
      velocityRef.current = { x: 0, y: 0 };
    }
  };

  const handleTouchMove = (e) => {
    if (!touchMode) return;

    if (intertiaRef.current) {
      cancelAnimationFrame(intertiaRef.current);
      intertiaRef.current = null;
    }

    const currentTouches = getTouches(e);

    if (touchMode === 'pan' && currentTouches.length === 1) { // TODO: test on touchscreen if touchMode is necessary
      const dx = currentTouches[0].x - startTouches[0].x;
      const dy = currentTouches[0].y - startTouches[0].y;

      velocityRef.current = {
        x: dx - (pan.x - initialPanRef.x),
        y: dy - (pan.y - initialPanRef.y),
      };

      setPan({
        x: initialPanRef.x + dx,
        y: initialPanRef.y + dy,
      });
    }
  };

  const correctPanBounds = () => {
    const imageDimensions = { width: 10000, height: 2000 }; // Hardcoded for now
    const rect = containerRef.current.getBoundingClientRect();
    const viewportWidth = rect.width;
    const viewportHeight = rect.height;
    const scaledImageWidth = imageDimensions.width * zoom;
    const scaledImageHeight = imageDimensions.height * zoom;

    // Calculate boundaries dynamically
    const minX = viewportWidth - scaledImageWidth;
    const maxX = 0;
    const minY = viewportHeight - scaledImageHeight;
    const maxY = 0;

    const needsCorrectionX = pan.x > maxX || pan.x < minX;
    const needsCorrectionY = pan.y > maxY || pan.y < minY;

    if (!needsCorrectionX && !needsCorrectionY) {
      return; // No correction needed
    }

    let correctedX = pan.x;
    let correctedY = pan.y;

    if (needsCorrectionX) {
      correctedX = Math.min(Math.max(pan.x, minX), maxX);
    }
    if (needsCorrectionY) {
      correctedY = Math.min(Math.max(pan.y, minY), maxY);
    }

    tween(
      0,
      1,
      (progress) => {
        setPan((prevPan) => ({
          x: needsCorrectionX ? prevPan.x + (correctedX - prevPan.x) * progress : prevPan.x,
          y: needsCorrectionY ? prevPan.y + (correctedY - prevPan.y) * progress : prevPan.y,
        }));
      },
      () => {
        console.log('Bounds correction complete');
      },
    );
  };

  const handleTouchEnd = () => {
    setTouchMode(null);
    setStartTouches([]);

    const inertia = () => {
      const friction = 0.9;
      velocityRef.current.x *= friction;
      velocityRef.current.y *= friction;

      const dx = velocityRef.current.x;
      const dy = velocityRef.current.y;

      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        setPan((prevPan) => ({
          x: prevPan.x + dx,
          y: prevPan.y + dy,
        }));
        intertiaRef.current = requestAnimationFrame(inertia);
      } else {
        cancelAnimationFrame(intertiaRef.current);
        intertiaRef.current = null;
        correctPanBounds(); // Ensure final correction after inertia
      }
    };

    inertia();
  };

  const handleWheel = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const imageX = (mouseX - pan.x) / zoom;
    const imageY = (mouseY - pan.y) / zoom;

    const newZoom = clampZoom(zoom * (1 - e.deltaY * zoomFactor), minZoom, maxZoom);

    const newPanX = mouseX - imageX * newZoom;
    const newPanY = mouseY - imageY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
  };

  const zoomIn = () => {
    const rect = containerRef.current.getBoundingClientRect();

    // Get the center of the viewport in container coordinates
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate the center point in the image's space based on the current zoom and pan
    const imageX = (centerX - pan.x) / zoom;
    const imageY = (centerY - pan.y) / zoom;

    // Target zoom level (exponentially increase)
    const clampedZoom = clampZoom(zoom * 2, minZoom, maxZoom);

    tween(
      zoom,
      clampedZoom,
      (value) => {
        // Update zoom during the tween
        setZoom(value);

        // Adjust pan to maintain the same center point
        const newPanX = centerX - imageX * value;
        const newPanY = centerY - imageY * value;
        setPan({ x: newPanX, y: newPanY });
      },
      () => {
        console.log('Zoom in animation complete');
      },
    );
  };

  const zoomOut = () => {
    // if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    // Get the center of the viewport in container coordinates
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate the center point in the image's space based on the current zoom and pan
    const imageX = (centerX - pan.x) / zoom;
    const imageY = (centerY - pan.y) / zoom;

    // Target zoom level (exponentially decrease)
    const clampedZoom = clampZoom(zoom / 2, minZoom, maxZoom);

    if (clampedZoom === zoom) {
      console.log('no movement needed');
      return;
    }

    tween(
      zoom,
      clampedZoom,
      (value) => {
        setZoom(value);

        // Adjust pan to maintain the same center point
        const newPanX = centerX - imageX * value;
        const newPanY = centerY - imageY * value;

        setPan({ x: newPanX, y: newPanY });
      },
      () => {
        console.log('Zoom out animation complete');
      },
    );
  };

  const zoomReset = () => {
    const rect = containerRef.current.getBoundingClientRect();

    // Get the center of the viewport in container coordinates
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate the center point in the image's space based on the current zoom and pan
    const imageX = (centerX - pan.x) / zoom;
    const imageY = (centerY - pan.y) / zoom;

    // Target zoom level (exponentially decrease)
    const targetZoom = clampZoom(initialZoom, minZoom, maxZoom);

    tween(
      zoom,
      targetZoom,
      (value) => {
        // Update zoom during the tween
        setZoom(value);

        // Adjust pan to maintain the same center point
        const newPanX = centerX - imageX * value;
        const newPanY = centerY - imageY * value;
        setPan({ x: newPanX, y: newPanY });
      },
      () => {
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
      <div style={transformStyle}>{children}</div>
      <div className="zoom-pan-controls-buttons">
        <button type="button" onClick={zoomIn}><img src={zoomInIcon} /></button>
        <button type="button" onClick={zoomOut}><img src={zoomOutIcon} /></button>
        <button type="button" onClick={zoomReset}><img src={zoomResetIcon} /></button>
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
};

export default ZoomPanControls;
