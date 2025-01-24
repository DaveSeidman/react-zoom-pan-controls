import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
// import { name, version } from '../package.json';
// console.log(`${name} ${version}`);

import './ZoomPanControls.scss';

const ZoomPanControls = ({
  minZoom = 0.5,
  maxZoom = 2,
  initialZoom = 1,
  initialPan = { x: 0, y: 0 },
  targetZoom,
  targetPan,
  onAnimationEnd,
  children,
  onTransformChange = () => { },
  duration = 1200, // duration in milliseconds
}) => {
  const [pan, setPan] = useState(initialPan);
  const [zoom, setZoom] = useState(initialZoom);
  const [touchMode, setTouchMode] = useState(null);
  const [startTouches, setStartTouches] = useState([]);
  const [initialPanRef, setInitialPanRef] = useState(initialPan);
  const [tweening, setTweening] = useState(false); // New state for tweening lock
  const velocityRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    onTransformChange({ zoom, pan });
  }, [zoom, pan, onTransformChange]);

  const clampZoom = (z, min, max) => Math.min(Math.max(z, min), max);

  // TODO: switch duration and onComplete
  const tween = (start, end, callback, duration, onComplete) => {
    const startTime = performance.now();

    const cubicBezier = (t) => {
      const c1 = 0, c2 = .9, c3 = 1, c4 = .1;
      return (1 - 3 * c3 + 3 * c1) * t * t * t + (3 * c3 - 6 * c1) * t * t + (3 * c1) * t;
    };
    const animate = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = cubicBezier(progress);
      const value = start + (end - start) * easedProgress;

      callback(value);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (targetZoom !== undefined && targetZoom !== zoom) {
      setTweening(true);
      tween(
        zoom,
        clampZoom(targetZoom, minZoom, maxZoom),
        setZoom,
        duration,
        () => { setTweening(false) }
      );
    }
  }, [targetZoom]);

  useEffect(() => {
    if (targetPan && (targetPan.x !== pan.x || targetPan.y !== pan.y)) {
      setTweening(true);
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
        duration,
        () => { setTweening(false) }
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
    if (tweening) return; // Ignore if a tween is happening

    if (e.touches.length === 1) {
      setTouchMode('pan');
      const currentTouches = getTouches(e);
      setStartTouches(currentTouches);
      setInitialPanRef({ x: pan.x, y: pan.y });
      velocityRef.current = { x: 0, y: 0 }; // Reset velocity
      cancelAnimationFrame(animationFrameRef.current); // Stop any ongoing inertia
    }
  };

  const handleTouchMove = (e) => {
    if (tweening || !touchMode) return; // Ignore if a tween is happening

    const currentTouches = getTouches(e);

    if (touchMode === 'pan' && currentTouches.length === 1) {
      const dx = currentTouches[0].x - startTouches[0].x;
      const dy = currentTouches[0].y - startTouches[0].y;

      // Calculate velocity
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

  const handleTouchEnd = () => {
    if (tweening) return; // Ignore if a tween is happening

    setTouchMode(null);
    setStartTouches([]);

    // Begin inertia
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

        animationFrameRef.current = requestAnimationFrame(inertia);
      } else {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };

    inertia();
  };

  const handleWheel = (e) => {
    if (tweening || !containerRef.current) return; // Ignore if a tween is happening

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
  };

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
  };

  const zoomIn = () => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    // Get the center of the viewport in container coordinates
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate the center point in the image's space based on the current zoom and pan
    const imageX = (centerX - pan.x) / zoom;
    const imageY = (centerY - pan.y) / zoom;

    // Target zoom level (exponentially increase)
    const targetZoom = clampZoom(zoom * 2, minZoom, maxZoom);

    setTweening(true);
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
      duration,
      () => {
        console.log('Zoom in animation complete');
        setTweening(false);
      }
    );
  };

  const zoomOut = () => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    // Get the center of the viewport in container coordinates
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate the center point in the image's space based on the current zoom and pan
    const imageX = (centerX - pan.x) / zoom;
    const imageY = (centerY - pan.y) / zoom;

    // Target zoom level (exponentially decrease)
    const targetZoom = clampZoom(zoom / 2, minZoom, maxZoom);

    setTweening(true);
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
      duration,
      () => {
        console.log('Zoom out animation complete');
        setTweening(false);
      }
    );
  };


  const zoomReset = () => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    // Get the center of the viewport in container coordinates
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate the center point in the image's space based on the current zoom and pan
    const imageX = (centerX - pan.x) / zoom;
    const imageY = (centerY - pan.y) / zoom;

    // Target zoom level (exponentially decrease)
    const targetZoom = clampZoom(initialZoom, minZoom, maxZoom);

    setTweening(true);
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
      duration,
      () => {
        setTweening(false);
      }
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
        <button style={{ width: 80, height: 80 }} onClick={zoomIn}></button>
        <button style={{ width: 80, height: 80 }} onClick={zoomOut}></button>
        <button style={{ width: 80, height: 80 }} onClick={zoomReset}></button>
      </div>
    </div>
  );
};

ZoomPanControls.propTypes = {
  minZoom: PropTypes.number,
  maxZoom: PropTypes.number,
  initialZoom: PropTypes.number,
  initialPan: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
  }),
  targetZoom: PropTypes.number,
  targetPan: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
  }),
  onAnimationEnd: PropTypes.func,
  onTransformChange: PropTypes.func,
  children: PropTypes.node.isRequired,
  duration: PropTypes.number,
};

export default ZoomPanControls;