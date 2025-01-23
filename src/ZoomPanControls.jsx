import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { version } from '../package.json'
import './ZoomPanControls.scss';

console.log(`zoom pan controls version: ${version}`)

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
}) => {
  const [pan, setPan] = useState(initialPan);
  const [zoom, setZoom] = useState(initialZoom);
  const [touchMode, setTouchMode] = useState(null);
  const [startTouches, setStartTouches] = useState([]);
  const [initialPanRef, setInitialPanRef] = useState(initialPan);
  const velocityRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef(null);
  const containerRef = useRef(null);


  useEffect(() => {
    onTransformChange({ zoom, pan });
  }, [zoom, pan, onTransformChange]);

  const clampZoom = (z, min, max) => Math.min(Math.max(z, min), max);

  const getTouches = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return [];
    return Array.from(e.touches).map((touch) => ({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }));
  };

  const handleTouchStart = (e) => {
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
    if (!touchMode) return;

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
  };

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
  };

  const zoomIn = () => setZoom((z) => clampZoom(z + 0.1, minZoom, maxZoom));
  const zoomOut = () => setZoom((z) => clampZoom(z - 0.1, minZoom, maxZoom));
  const zoomReset = () => {
    setZoom(initialZoom);
    setPan(initialPan);
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
};

export default ZoomPanControls;
