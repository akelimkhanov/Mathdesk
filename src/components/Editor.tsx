'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CloudOff,
  Download,
  HelpCircle,
  LoaderCircle,
  Maximize2,
  Maximize,
  Minimize,
  Minus,
  Plus,
  Settings2,
  Sigma,
  Sun,
  Moon,
  Presentation,
  X,
  Copy,
} from 'lucide-react';
import { useEditor } from '@/store/editor';
import type { BoardObject, Point, Tool } from '@/core/types';
import { fitCamera, zoomAt } from '@/core/geometry';
import { downloadBoard } from '@/persistence/boards';
import { useSettings } from '@/i18n/context';
import type { Locale, TranslationKey } from '@/i18n/dictionaries';
import BoardCanvas from './BoardCanvas';
import Toolbar from './Toolbar';
import Inspector from './Inspector';
import ContentDialog, { type ContentRequest } from './ContentDialog';
import { Dialog, IconButton } from './Controls';
import { useAutosave } from './useAutosave';
import { CameraMotion } from '@/core/cameraMotion';
import { cloneObjects } from '@/core/selection';
import { usePresentation } from './usePresentation';
import { useBrowserFullscreen } from './useBrowserFullscreen';
import DrawingContext from './DrawingContext';
import MathRecognitionDialog from './MathRecognitionDialog';
import { captureHandwriting, type HandwritingSelection } from '@/core/handwritingMath';
import { mathRecognitionProvider } from '@/services/mathRecognitionProvider';

export default function Editor({ onExit }: { onExit: () => void }) {
  const { t, locale, setLocale, theme, toggleTheme } = useSettings();
  const s = useEditor();
  const { status, flush } = useAutosave();
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [content, setContent] = useState<ContentRequest | null>(null);
  const [recognition, setRecognition] = useState<HandwritingSelection | null>(null);
  const [panel, setPanel] = useState<'settings' | 'help' | null>(null);
  const { presentation, enter: enterPresentation, exit: exitPresentation } = usePresentation();
  const browserFullscreen = useBrowserFullscreen();
  const [motion] = useState(
    () =>
      new CameraMotion(
        () => useEditor.getState().camera,
        (camera) => useEditor.getState().setCamera(camera),
      ),
  );
  useEffect(() => () => motion.stop(), [motion]);
  const [toast, setToast] = useState('');
  const clipboard = useRef<BoardObject[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSize = useCallback((next: { width: number; height: number }) => setSize(next), []);
  const onInsert = (kind: 'text' | 'math', point: Point) => setContent({ kind, point });
  const onEdit = (object: BoardObject) => {
    if (object.type === 'text' || object.type === 'math')
      setContent({ kind: object.type, point: { x: object.x, y: object.y }, object });
  };
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (content || panel || recognition) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))
        return;
      const state = useEditor.getState();
      if (!state.document) return;
      if (e.key === 'Escape') {
        if (browserFullscreen.handleEscape()) return;
        exitPresentation();
        state.select([]);
        return;
      }
      const mod = e.ctrlKey || e.metaKey,
        key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        state.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        state.duplicate();
      } else if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) state.ungroupSelection();
        else state.groupSelection();
      } else if (mod && key === 's') {
        e.preventDefault();
        void flush();
      } else if (mod && key === 'c') {
        if (state.selected.length) {
          e.preventDefault();
          clipboard.current = structuredClone(
            state.document.objects.filter((o) => state.selected.includes(o.id)),
          );
        }
      } else if (mod && key === 'v') {
        if (clipboard.current.length) {
          e.preventDefault();
          const copies = cloneObjects(clipboard.current, 32);
          state.commit([...state.document.objects, ...copies]);
          state.select(copies.map((o) => o.id));
          clipboard.current = copies;
        }
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        state.remove();
      } else if (!mod && key === 'f') {
        e.preventDefault();
        motion.to(fitCamera(state.document.objects, size));
      } else if (!mod && !e.altKey) {
        const keys: Record<string, Tool> = {
          v: 'select',
          p: 'pen',
          e: 'eraser',
          t: 'text',
          m: 'math',
          h: 'pan',
        };
        if (keys[key]) state.setTool(keys[key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [content, panel, recognition, size, presentation, flush, browserFullscreen.handleEscape]);
  if (!s.document) return null;
  const doc = s.document;
  const hint: TranslationKey =
    s.tool === 'select' || s.tool === 'lasso'
      ? 'selectionHint'
      : s.tool === 'pan'
        ? 'panHint'
        : s.tool === 'text'
          ? 'textHint'
          : s.tool === 'math'
            ? 'mathHint'
            : s.tool === 'eraser'
              ? 'eraserStatus'
              : ['pen', 'pencil', 'marker'].includes(s.tool)
                ? 'drawingHint'
                : 'shapeHint';
  const selected = doc.objects.filter((o) => s.selected.includes(o.id));
  function zoom(factor: number) {
    motion.zoom({ x: size.width / 2, y: size.height / 2 }, factor);
  }
  async function exit() {
    if (await flush()) onExit();
    else notify(t('confirmLeave'));
  }
  return (
    <div className={`editor ${presentation ? 'presenting' : ''}`}>
      {!presentation && (
        <header className="editor-header">
          <div className="header-left">
            <IconButton label={t('back')} onClick={() => void exit()} testId="back">
              <ArrowLeft size={18} />
            </IconButton>
            <div className="brand-mark">
              <Sigma size={21} />
            </div>
            <span className="header-divider" />
            <div className="board-title">
              <input
                aria-label={t('renameHint')}
                maxLength={200}
                value={doc.title}
                onChange={(e) => s.updateMeta({ title: e.target.value })}
              />
              <button
                className={`save-status ${status === 'error' ? 'error' : ''}`}
                onClick={() => void flush()}
                title={t('save')}
                data-testid="save-status"
              >
                {status === 'saved' ? (
                  <Check size={12} />
                ) : status === 'saving' ? (
                  <LoaderCircle size={12} className="spinning" />
                ) : (
                  <CloudOff size={12} />
                )}
                <span>
                  {t(status === 'saved' ? 'saved' : status === 'saving' ? 'saving' : 'saveError')}
                </span>
              </button>
            </div>
          </div>
          <div className="header-actions">
            <span className="mvp-badge">{t('localOnly')}</span>
            <LanguageSelect />
            <IconButton label={t('theme')} onClick={toggleTheme}>
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </IconButton>
            <IconButton label={t('settings')} onClick={() => setPanel('settings')}>
              <Settings2 size={18} />
            </IconButton>
            <IconButton
              label={t('presentation')}
              onClick={() => {
                s.select([]);
                enterPresentation();
              }}
            >
              <Presentation size={18} />
            </IconButton>
            <button
              className="button download-button"
              onClick={() => downloadBoard(doc)}
              data-testid="download"
            >
              <Download size={16} />
              <span>{t('download')}</span>
            </button>
          </div>
        </header>
      )}
      <main className="board-main">
        <BoardCanvas
          onInsert={onInsert}
          onEdit={onEdit}
          onSize={onSize}
          presentation={presentation}
          motion={motion}
          dialogOpen={!!content || !!panel || !!recognition}
        />
        {!presentation && (
          <>
            <Toolbar />
            <Inspector
              onEdit={onEdit}
              onRecognize={() => {
                try {
                  setRecognition(captureHandwriting(doc, s.selected));
                } catch (error) {
                  notify(
                    t(
                      error instanceof Error && error.message === 'HANDWRITING_TOO_LARGE'
                        ? 'recognitionTooLarge'
                        : 'recognitionError',
                    ),
                  );
                }
              }}
            />
            <div className="bottom-status">
              <span className="status-dot" />
              {t(hint)}
              {selected.length > 0 && (
                <span className="selected-count">
                  {selected.length} {t('selectedCount')}
                </span>
              )}
            </div>
            <div className="zoom-controls">
              <IconButton label={t('zoomOut')} onClick={() => zoom(1 / 1.2)}>
                <Minus size={16} />
              </IconButton>
              <button
                className="zoom-value"
                title={t('resetZoom')}
                aria-label={t('resetZoom')}
                onClick={() =>
                  motion.to(zoomAt(s.camera, { x: size.width / 2, y: size.height / 2 }, 1))
                }
              >
                {Math.round(s.camera.zoom * 100)}%
              </button>
              <IconButton label={t('zoomIn')} onClick={() => zoom(1.2)}>
                <Plus size={16} />
              </IconButton>
              <span className="control-divider" />
              <IconButton label={t('fit')} onClick={() => motion.to(fitCamera(doc.objects, size))}>
                <Maximize2 size={16} />
              </IconButton>
              <span className="control-divider" />
              <IconButton label={t('help')} onClick={() => setPanel('help')}>
                <HelpCircle size={17} />
              </IconButton>
            </div>
            {selected.length === 1 && selected[0].type === 'math' && (
              <button
                className="copy-latex button"
                onClick={async () => {
                  try {
                    if (selected[0].type === 'math')
                      await navigator.clipboard.writeText(selected[0].latex);
                    notify(t('copied'));
                  } catch {
                    notify(t('clipboardError'));
                  }
                }}
              >
                <Copy size={14} />
                {t('copyLatex')}
              </button>
            )}
          </>
        )}
        {presentation && (
          <>
            <Toolbar compact />
            {['pen', 'pencil', 'marker', 'eraser'].includes(s.tool) && <DrawingContext minimal />}
            <div className="presentation-exit">
              <span>
                {t(browserFullscreen.fullscreen ? 'browserFullscreenHint' : 'presentationHint')}
              </span>
              {browserFullscreen.supported && (
                <button
                  className="button browser-fullscreen"
                  data-testid="browser-fullscreen"
                  aria-label={t(
                    browserFullscreen.fullscreen ? 'exitBrowserFullscreen' : 'browserFullscreen',
                  )}
                  title={t(
                    browserFullscreen.fullscreen ? 'exitBrowserFullscreen' : 'browserFullscreen',
                  )}
                  disabled={browserFullscreen.pending}
                  onClick={() => void browserFullscreen.toggle()}
                >
                  {browserFullscreen.fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                  <span>
                    {t(
                      browserFullscreen.fullscreen ? 'exitBrowserFullscreen' : 'browserFullscreen',
                    )}
                  </span>
                </button>
              )}
              <IconButton label={t('exitPresentation')} onClick={exitPresentation}>
                <X size={18} />
              </IconButton>
            </div>
          </>
        )}
      </main>
      {content && <ContentDialog request={content} onClose={() => setContent(null)} />}
      {recognition && (
        <MathRecognitionDialog
          selection={recognition}
          provider={mathRecognitionProvider}
          onClose={() => setRecognition(null)}
        />
      )}
      {panel === 'settings' && (
        <Dialog title={t('settings')} onClose={() => setPanel(null)}>
          <div className="settings-fields">
            {(['subject', 'grade', 'topic'] as const).map((key) => (
              <label key={key} className="field-label">
                {t(key)}
                <input
                  maxLength={200}
                  value={doc[key]}
                  onChange={(e) => s.updateMeta({ [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="field-label">
              {t('background')}
              <select
                value={doc.background}
                onChange={(e) =>
                  s.updateMeta({ background: e.target.value as typeof doc.background })
                }
              >
                {(['dots', 'grid', 'plain', 'ruled'] as const).map((key) => (
                  <option key={key} value={key}>
                    {t(key)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              {t('language')}
              <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                <option value="ru">Русский</option>
                <option value="kk">Қазақша</option>
                <option value="en">English</option>
              </select>
            </label>
            <p className="muted small">{t('localNotice')}</p>
            <p className="muted small">{t('unavailable')}</p>
          </div>
        </Dialog>
      )}
      {panel === 'help' && (
        <Dialog title={t('helpTitle')} onClose={() => setPanel(null)}>
          <div className="shortcut-list">
            {(
              [
                'shortcutPan',
                'shortcutZoom',
                'shortcutSelect',
                'shortcutEdit',
                'shortcutUndo',
                'shortcutRedo',
                'shortcutTools',
                'shortcutOther',
                'selectionGestures',
              ] as const
            ).map((key) => (
              <p key={key}>{t(key)}</p>
            ))}
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
export function LanguageSelect() {
  const { t, locale, setLocale } = useSettings();
  return (
    <select
      className="language-select"
      aria-label={t('language')}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
    >
      <option value="ru">RU</option>
      <option value="kk">KZ</option>
      <option value="en">EN</option>
    </select>
  );
}
