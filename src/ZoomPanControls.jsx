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
  const tweenRef = useRef(); // track tweened animations

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
    // console.log(zoom, pan);
  }, [zoom, pan]);

  const clampZoom = (z, min, max) => Math.min(Math.max(z, min), max);

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
    console.log(targetPan);
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
      );
    }
  }, [targetPan]);

  const correctPanBounds = () => {
    // console.log(childrenRef.current.getBoundingClientRect());
    const imageDimensions = { width: 10000, height: 2000 };
    const viewportWidth = containerRectRef.current.width;
    const viewportHeight = containerRectRef.current.height;
    const scaledImageWidth = imageDimensions.width * zoom;
    const scaledImageHeight = imageDimensions.height * zoom;

    const minX = viewportWidth - scaledImageWidth;
    const maxX = 0;
    const minY = viewportHeight - scaledImageHeight;
    const maxY = 0;

    const needsCorrectionX = pan.x > maxX || pan.x < minX;
    const needsCorrectionY = pan.y > maxY || pan.y < minY;

    if (!needsCorrectionX && !needsCorrectionY) return;

    let correctedX = pan.x;
    let correctedY = pan.y;

    if (needsCorrectionX) correctedX = Math.min(Math.max(pan.x, minX), maxX);
    if (needsCorrectionY) correctedY = Math.min(Math.max(pan.y, minY), maxY);

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

  const getTouches = (e) => Array.from(e.touches).map((touch) => ({
    x: touch.clientX - containerRectRef.current.left,
    y: touch.clientY - containerRectRef.current.top,
  }));

  const handleTouchStart = (e) => {
    if (tweenRef.current) {
      cancelAnimationFrame(tweenRef.current);
      tweenRef.current = null;
    }
    if (intertiaRef.current) {
      cancelAnimationFrame(intertiaRef.current);
      intertiaRef.current = null;
    }

    if (e.touches.length === 1) {
      const currentTouches = getTouches(e);
      setStartTouches(currentTouches);
      setInitialPanRef({ x: pan.x, y: pan.y });
      velocityRef.current = { x: 0, y: 0 };
    }
  };

  const handleTouchMove = (e) => {
    if (intertiaRef.current) {
      cancelAnimationFrame(intertiaRef.current);
      intertiaRef.current = null;
    }

    const currentTouches = getTouches(e);

    if (currentTouches.length === 1) {
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

  const handleTouchEnd = () => {
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
        // correctPanBounds(); // final correction
      }
    };

    inertia();
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
    setPan({ x: newPanX, y: newPanY });
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
        setPan({ x: newPanX, y: newPanY });
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
        setPan({ x: newPanX, y: newPanY });
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
        setPan({ x: newPanX, y: newPanY });
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
