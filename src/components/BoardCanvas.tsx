'use client';
import { useEffect, useRef, useState } from 'react';
import { MoveUpRight, PenLine, Sigma } from 'lucide-react';
import { useEditor } from '@/store/editor';
import { bounds, intersects, screenToWorld, unionBounds } from '@/core/geometry';
import type { BoardObject, Point } from '@/core/types';
import { renderScene } from '@/render/canvas';
import { useSettings } from '@/i18n/context';
import { useBoardGestures } from './useBoardGestures';
import type { CameraMotion } from '@/core/cameraMotion';
import MathView from './MathView';

export default function BoardCanvas({
  onInsert,
  onEdit,
  onSize,
  presentation = false,
  dialogOpen = false,
  motion,
}: {
  onInsert: (kind: 'text' | 'math', point: Point) => void;
  onEdit: (object: BoardObject) => void;
  onSize: (size: { width: number; height: number }) => void;
  presentation?: boolean;
  dialogOpen?: boolean;
  motion: CameraMotion;
}) {
  const surface = useRef<HTMLDivElement>(null),
    scene = useRef<HTMLCanvasElement>(null),
    overlay = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const { theme, t } = useSettings();
  const { preview, pointerDown, pointerMove, pointerUp, pointerCancel, spaceHeld, recognized } =
    useBoardGestures({
      surface,
      overlay,
      size,
      onInsert,
      enabled: !dialogOpen,
      motion,
    });
  const doc = useEditor((s) => s.document),
    camera = useEditor((s) => s.camera),
    tool = useEditor((s) => s.tool);
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      const next = { width: r.width, height: r.height };
      setSize(next);
      onSize(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onSize]);
  const objects = preview ?? doc?.objects ?? [];
  useEffect(() => {
    if (scene.current) renderScene(scene.current, size, camera, objects, theme === 'dark');
  }, [size, camera, objects, theme]);
  if (!doc) return null;
  const viewport = {
    x: -camera.x / camera.zoom,
    y: -camera.y / camera.zoom,
    width: size.width / camera.zoom,
    height: size.height / camera.zoom,
  };
  const domObjects = objects.filter(
    (o) => (o.type === 'text' || o.type === 'math') && intersects(bounds(o), viewport),
  );
  const spacing =
    (doc.background === 'grid' ? 24 : doc.background === 'ruled' ? 32 : 24) * camera.zoom;
  return (
    <div
      ref={surface}
      className={`board-surface tool-${spaceHeld ? 'pan' : tool} background-${doc.background}`}
      data-testid="board-canvas"
      role="application"
      aria-label={t('board')}
      tabIndex={0}
      style={{
        backgroundSize: `${spacing}px ${spacing}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerCancel}
      onDoubleClick={(e) => {
        if (dialogOpen) return;
        const r = surface.current!.getBoundingClientRect();
        const point = screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top }, camera);
        const o = [...objects]
          .reverse()
          .find(
            (o) =>
              !o.locked &&
              (o.type === 'text' || o.type === 'math') &&
              intersects({ x: point.x, y: point.y, width: 0, height: 0 }, bounds(o)),
          );
        if (o) onEdit(o);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {recognized && (
        <div className="recognition-hint" role="status" data-testid="hold-recognition">
          {t(
            recognized === 'line'
              ? 'holdLine'
              : recognized === 'ellipse'
                ? 'holdCircle'
                : 'holdRectangle',
          )}{' '}
          · {t('holdHint')}
        </div>
      )}
      <canvas ref={scene} className="scene-canvas" aria-hidden="true" />
      <div
        className="semantic-layer"
        style={{ transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})` }}
      >
        {domObjects.map((o) => (
          <div
            key={o.id}
            data-testid={`object-${o.type}`}
            className={`semantic-object ${o.type}`}
            style={{
              left: o.x,
              top: o.y,
              width: o.width,
              height: o.height,
              transform: `rotate(${o.rotation}rad)`,
              color: theme === 'dark' && o.style.color === '#303245' ? '#e4e5f1' : o.style.color,
              opacity: o.style.opacity,
              fontSize: 'fontSize' in o ? o.fontSize : 24,
            }}
          >
            <div className="semantic-content" style={{ width: o.width, height: o.height }}>
              {o.type === 'text' ? o.text : o.type === 'math' ? <MathView latex={o.latex} /> : null}
            </div>
          </div>
        ))}
      </div>
      <canvas ref={overlay} className="overlay-canvas" aria-hidden="true" />
      {!objects.length && !presentation && (
        <div className="board-welcome">
          <div className="welcome-mark">
            <Sigma size={30} />
          </div>
          <span className="eyebrow">{t('localOnly')}</span>
          <h2>{t('welcome')}</h2>
          <p>{t('welcomeHint')}</p>
          <div className="welcome-actions">
            <button
              className="button primary"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => useEditor.getState().setTool('pen')}
            >
              <PenLine size={16} />
              {t('startPen')}
            </button>
            <button
              className="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() =>
                onInsert(
                  'math',
                  screenToWorld({ x: size.width / 2 - 130, y: size.height / 2 }, camera),
                )
              }
            >
              <Sigma size={17} />
              {t('formulaExample')}
            </button>
          </div>
          <div className="welcome-hint">
            <MoveUpRight size={14} />
            {t('shortcutPan')}
          </div>
        </div>
      )}
      {camera.zoom < 0.5 && objects.length > 0 && <Minimap objects={objects} viewport={viewport} />}
    </div>
  );
}
function Minimap({
  objects,
  viewport,
}: {
  objects: BoardObject[];
  viewport: { x: number; y: number; width: number; height: number };
}) {
  const { t } = useSettings();
  const b = unionBounds(objects);
  if (!b) return null;
  const x = Math.min(b.x, viewport.x),
    y = Math.min(b.y, viewport.y),
    w = Math.max(b.x + b.width, viewport.x + viewport.width) - x,
    h = Math.max(b.y + b.height, viewport.y + viewport.height) - y;
  return (
    <div className="minimap" aria-label={t('minimap')}>
      <svg
        viewBox={`${x - 20} ${y - 20} ${w + 40} ${h + 40}`}
        width="148"
        height="98"
        aria-hidden="true"
      >
        {objects.slice(0, 1000).map((o) => {
          const r = bounds(o);
          return <rect key={o.id} {...r} fill={o.style.color} opacity="0.4" />;
        })}
        <rect {...viewport} fill="#7c5ce712" stroke="#7c5ce7" strokeWidth={Math.max(w, h) / 150} />
      </svg>
    </div>
  );
}
