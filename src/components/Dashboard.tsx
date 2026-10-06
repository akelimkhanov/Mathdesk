'use client';
import { useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Download,
  FileUp,
  Moon,
  Plus,
  Sigma,
  Sun,
  Trash2,
  Triangle,
  PenLine,
} from 'lucide-react';
import { useSettings } from '@/i18n/context';
import type { BoardDocument } from '@/core/types';
import { createBoard } from '@/core/types';
import { exampleBoard } from '@/core/example';
import { parseBoard } from '@/core/validation';
import { downloadBoard } from '@/persistence/boards';
import { IconButton, Dialog } from './Controls';
import { LanguageSelect } from './Editor';
export default function Dashboard({
  boards,
  onOpen,
  onRemove,
  error,
  onRetry,
}: {
  boards: BoardDocument[];
  onOpen: (b: BoardDocument) => void;
  onRemove: (id: string) => Promise<void>;
  error: string;
  onRetry: () => void;
}) {
  const { t, theme, toggleTheme, locale } = useSettings();
  const [create, setCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [remove, setRemove] = useState<BoardDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  async function importFile(selected?: File) {
    if (!selected) return;
    setFileError('');
    try {
      if (selected.size > 25 * 1024 * 1024) {
        setFileError(t('fileLimit'));
        return;
      }
      const board = parseBoard(JSON.parse(await selected.text()));
      onOpen({ ...board, id: crypto.randomUUID(), updatedAt: new Date().toISOString() });
    } catch {
      setFileError(t('invalidFile'));
    } finally {
      if (file.current) file.current.value = '';
    }
  }
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <a className="brand" href="/" aria-label={t('app')}>
          <span className="brand-mark">
            <Sigma size={24} />
          </span>
          {t('app')}
          <span className="brand-beta">MVP 1</span>
        </a>
        <div className="header-actions">
          <LanguageSelect />
          <IconButton label={t('theme')} onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
          </IconButton>
        </div>
      </header>
      <main className="dashboard-content">
        <div className="dashboard-intro">
          <div>
            <span className="eyebrow">
              <BookOpen size={14} />
              {t('tagline')}
            </span>
            <h1>
              {t('workspace')}
              <span className="board-count">{boards.length}</span>
            </h1>
            <p>{t('boardsHint')}</p>
          </div>
          <div className="dashboard-actions">
            <button className="button" onClick={() => file.current?.click()}>
              <FileUp size={17} />
              {t('importBoard')}
            </button>
            <button
              className="button primary"
              data-testid="new-board"
              onClick={() => {
                setTitle(t('untitled'));
                setCreate(true);
              }}
            >
              <Plus size={18} />
              {t('newBoard')}
            </button>
          </div>
        </div>
        <input
          ref={file}
          type="file"
          accept=".json,.mathboard.json,application/json"
          hidden
          aria-label={t('importBoard')}
          data-testid="import-file"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
        {(error || fileError) && (
          <div className="alert" role="alert">
            {fileError || error}
            {error && (
              <button className="button" onClick={onRetry}>
                {t('retry')}
              </button>
            )}
          </div>
        )}
        {boards.length === 0 ? (
          <div className="empty-dashboard">
            <div className="empty-illustration">
              <div className="illustration-equation">x² + y² = r²</div>
              <div className="illustration-circle" />
              <PenLine size={30} className="illustration-pen" />
            </div>
            <h2>{t('emptyBoards')}</h2>
            <p>{t('emptyHint')}</p>
            <button
              className="button primary"
              onClick={() => {
                setTitle(t('untitled'));
                setCreate(true);
              }}
            >
              <Plus size={17} />
              {t('newBoard')}
            </button>
          </div>
        ) : (
          <div className="board-grid">
            {boards.map((board) => (
              <article className="board-card" key={board.id}>
                <button
                  className="board-preview"
                  aria-label={`${t('open')}: ${board.title}`}
                  onClick={() => onOpen(board)}
                >
                  <BoardPreview board={board} />
                  <span className="preview-open">
                    <ArrowUpRight size={20} />
                  </span>
                </button>
                <div className="card-content">
                  <button className="card-title" onClick={() => onOpen(board)}>
                    {board.title || t('untitled')}
                  </button>
                  <p>
                    {[board.subject, board.grade, board.topic].filter(Boolean).join(' · ') ||
                      t('mathSubject')}
                  </p>
                  <div className="card-bottom">
                    <span>
                      {new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }).format(new Date(board.updatedAt))}{' '}
                      · {board.objects.length} {t('objects')}
                    </span>
                    <div>
                      <IconButton label={t('download')} onClick={() => downloadBoard(board)}>
                        <Download size={15} />
                      </IconButton>
                      <IconButton label={t('delete')} onClick={() => setRemove(board)}>
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <button
          className="example-card"
          onClick={() =>
            onOpen(exampleBoard(t('exampleTitle'), t('exampleHeading'), t('exampleNote')))
          }
        >
          <span className="example-icon">
            <Triangle size={24} />
          </span>
          <span>
            <strong>{t('example')}</strong>
            <small>{t('exampleHint')}</small>
          </span>
          <ArrowUpRight size={20} />
        </button>
        <p className="local-notice">
          <span className="status-dot" />
          {t('localNotice')}
        </p>
      </main>
      {create && (
        <Dialog title={t('newBoard')} onClose={() => setCreate(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) onOpen(createBoard(title.trim()));
            }}
          >
            <label className="field-label" htmlFor="new-title">
              {t('title')}
            </label>
            <input
              id="new-title"
              data-testid="new-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => setCreate(false)}>
                {t('cancel')}
              </button>
              <button
                className="button primary"
                data-testid="create-board"
                disabled={!title.trim()}
              >
                {t('create')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {remove && (
        <Dialog
          title={t('confirmDelete')}
          onClose={() => {
            if (!busy) setRemove(null);
          }}
        >
          <p>{remove.title}</p>
          <div className="dialog-actions">
            <button className="button" disabled={busy} onClick={() => setRemove(null)}>
              {t('cancel')}
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onRemove(remove.id);
                  setRemove(null);
                } catch {
                  setFileError(t('saveError'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('delete')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function BoardPreview({ board }: { board: BoardDocument }) {
  const objects = board.objects.slice(0, 8);
  return (
    <div className="thumbnail-content">
      {objects.length ? (
        objects.map((o) =>
          o.type === 'text' ? (
            <span key={o.id} className="thumb-text" style={{ color: o.style.color }}>
              {o.text.slice(0, 60)}
            </span>
          ) : o.type === 'math' ? (
            <span key={o.id} className="thumb-math" style={{ color: o.style.color }}>
              {o.latex.slice(0, 55)}
            </span>
          ) : o.type === 'shape' ? (
            <span
              key={o.id}
              className={`thumb-shape thumb-${o.kind}`}
              style={{ borderColor: o.style.color }}
            />
          ) : (
            <svg
              key={o.id}
              width="110"
              height="35"
              viewBox={`0 0 ${Math.max(1, o.width)} ${Math.max(1, o.height)}`}
              preserveAspectRatio="none"
            >
              <polyline
                points={o.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={o.style.color}
                strokeWidth={Math.max(1, o.width / 100)}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ),
        )
      ) : (
        <Sigma size={35} className="muted" />
      )}
    </div>
  );
}
