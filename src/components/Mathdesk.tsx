'use client';
import { useCallback, useEffect, useState } from 'react';
import { localBoards } from '@/persistence/boards';
import type { BoardDocument } from '@/core/types';
import { useEditor } from '@/store/editor';
import { useSettings } from '@/i18n/context';
import Dashboard from './Dashboard';
import Editor from './Editor';
export default function Mathdesk() {
  const { t } = useSettings();
  const [boards, setBoards] = useState<BoardDocument[]>([]);
  const [error, setError] = useState(false);
  const doc = useEditor((s) => s.document);
  const refresh = useCallback(async () => {
    try {
      setBoards(await localBoards.list());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return doc ? (
    <Editor
      onExit={() => {
        useEditor.getState().close();
        void refresh();
      }}
    />
  ) : (
    <Dashboard
      boards={boards}
      error={error ? t('loadError') : ''}
      onRetry={() => void refresh()}
      onOpen={(board) => useEditor.getState().load(board)}
      onRemove={async (id) => {
        await localBoards.remove(id);
        await refresh();
      }}
    />
  );
}
