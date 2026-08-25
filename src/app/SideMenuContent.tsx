// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The sidebar: namespaces on top, then the saved-session tree — folders (one
// level, like the notes sibling) with loose sessions below — and a footer
// with storage and settings. Folder create/rename is inline (focus + select
// on mount, Enter/blur commits, empty cancels); session rows get a
// right-click / long-press action menu.

import { useState } from "react";

import {
  Button,
  ConfirmDialog,
  FolderIcon,
  InlineEditRow,
  ListIcon,
  PencilIcon,
  PlusIcon,
  RowActionMenu,
  TrashIcon,
  CogIcon,
} from "@niclaslindstedt/oss-framework/components";
import {
  NamespaceSwitcher,
  type Namespace,
} from "@niclaslindstedt/oss-framework/namespaces";

import { sessionTitle, type Folder, type Session } from "./session.ts";

type Props = {
  namespaces: Namespace[];
  activeNamespace: string;
  onSwitchNamespace: (slug: string) => void;
  onManageNamespaces: () => void;
  sessions: readonly Session[];
  folders: readonly Folder[];
  activeSessionId: string;
  onOpenSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onMoveSession: (id: string, folderId: string | undefined) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onOpenSettings: () => void;
  storageLabel: string;
  onOpenStorage: () => void;
};

export function SideMenuContent({
  namespaces,
  activeNamespace,
  onSwitchNamespace,
  onManageNamespaces,
  sessions,
  folders,
  activeSessionId,
  onOpenSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onMoveSession,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenSettings,
  storageLabel,
  onOpenStorage,
}: Props) {
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renamingSession, setRenamingSession] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null);

  const loose = sessions.filter(
    (s) => !s.folderId || !folders.some((f) => f.id === s.folderId),
  );

  const sessionRow = (session: Session, indent: boolean) => {
    if (renamingSession === session.id) {
      return (
        <InlineEditRow
          key={session.id}
          initial={session.title}
          placeholder="Session name"
          ariaLabel="Rename session"
          icon={<ListIcon className="h-4 w-4" />}
          className={indent ? "ml-4" : ""}
          onCommit={(value) => {
            setRenamingSession(null);
            if (value.trim()) onRenameSession(session.id, value.trim());
          }}
          onCancel={() => setRenamingSession(null)}
        />
      );
    }
    const moveActions = [
      ...(session.folderId
        ? [
            {
              label: "Move out of folder",
              icon: <FolderIcon className="h-4 w-4" />,
              onSelect: () => onMoveSession(session.id, undefined),
            },
          ]
        : []),
      ...folders
        .filter((f) => f.id !== session.folderId)
        .map((f) => ({
          label: `Move to ${f.name}`,
          icon: <FolderIcon className="h-4 w-4" />,
          onSelect: () => onMoveSession(session.id, f.id),
        })),
    ];
    return (
      <RowActionMenu
        key={session.id}
        ariaLabel={`Actions for ${sessionTitle(session)}`}
        actions={[
          {
            label: "Rename",
            icon: <PencilIcon className="h-4 w-4" />,
            onSelect: () => setRenamingSession(session.id),
          },
          ...moveActions,
          {
            label: "Delete",
            icon: <TrashIcon className="h-4 w-4" />,
            danger: true,
            onSelect: () => setConfirmDelete(session),
          },
        ]}
      >
        <button
          type="button"
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
            indent ? "ml-4" : ""
          } ${
            session.id === activeSessionId
              ? "bg-surface-2 text-fg-bright"
              : "text-fg hover:bg-surface-2"
          }`}
          onClick={() => onOpenSession(session.id)}
        >
          <ListIcon className="h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 truncate">{sessionTitle(session)}</span>
        </button>
      </RowActionMenu>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 grow overflow-y-auto p-2">
        <NamespaceSwitcher
          namespaces={namespaces}
          activeNamespace={activeNamespace}
          onSwitch={onSwitchNamespace}
          onManage={onManageNamespaces}
        />

        <div className="mt-3 flex items-center justify-between px-2">
          <span className="text-xs font-semibold tracking-wide text-muted uppercase">
            Sessions
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              aria-label="New folder"
              onClick={() => setCreatingFolder(true)}
            >
              <FolderIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              aria-label="New session"
              onClick={onNewSession}
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {creatingFolder ? (
          <InlineEditRow
            initial=""
            placeholder="Folder name"
            ariaLabel="New folder name"
            icon={<FolderIcon className="h-4 w-4" />}
            onCommit={(value) => {
              setCreatingFolder(false);
              if (value.trim()) onCreateFolder(value.trim());
            }}
            onCancel={() => setCreatingFolder(false)}
          />
        ) : null}

        {folders.map((folder) => {
          const children = sessions.filter((s) => s.folderId === folder.id);
          return (
            <div key={folder.id} className="mt-1">
              {renamingFolder === folder.id ? (
                <InlineEditRow
                  initial={folder.name}
                  placeholder="Folder name"
                  ariaLabel="Rename folder"
                  icon={<FolderIcon className="h-4 w-4" />}
                  onCommit={(value) => {
                    setRenamingFolder(null);
                    if (value.trim()) onRenameFolder(folder.id, value.trim());
                  }}
                  onCancel={() => setRenamingFolder(null)}
                />
              ) : (
                <RowActionMenu
                  ariaLabel={`Actions for folder ${folder.name}`}
                  actions={[
                    {
                      label: "Rename folder",
                      icon: <PencilIcon className="h-4 w-4" />,
                      onSelect: () => setRenamingFolder(folder.id),
                    },
                    {
                      label: "Delete folder",
                      icon: <TrashIcon className="h-4 w-4" />,
                      danger: true,
                      onSelect: () => onDeleteFolder(folder.id),
                    },
                  ]}
                >
                  <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted">
                    <FolderIcon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{folder.name}</span>
                  </div>
                </RowActionMenu>
              )}
              {children.map((s) => sessionRow(s, true))}
            </div>
          );
        })}

        <div className="mt-1">{loose.map((s) => sessionRow(s, false))}</div>

        {sessions.length === 0 && !creatingFolder ? (
          <p className="px-2 py-4 text-xs text-muted">
            Saved sessions appear here. Press the disk icon to keep the current
            tape.
          </p>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-line p-2">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
          onClick={onOpenStorage}
        >
          <FolderIcon className="h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 truncate">{storageLabel}</span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
          onClick={onOpenSettings}
        >
          <CogIcon className="h-4 w-4 shrink-0 text-muted" />
          Settings
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete session?"
        description={
          confirmDelete
            ? `“${sessionTitle(confirmDelete)}” and its history will be removed from storage.`
            : ""
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          if (confirmDelete) onDeleteSession(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
