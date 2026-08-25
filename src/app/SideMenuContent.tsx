// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The sidebar: namespaces on top, then the saved-session tree — folders (one
// level, like the notes sibling) with loose sessions below — and a footer
// with About and Settings (storage lives in Settings → Storage, so the
// footer stays about the app itself). Folder create/rename is inline (focus +
// select on mount, Enter/blur commits, empty cancels); session rows get a
// right-click / long-press action menu.
//
// A chevron rail above the footer folds it away, handing those two rows to the
// session list. The choice persists (`calc:footer-collapsed`) and is offered on
// every viewport — the phone drawer gets the same control as the docked
// sidebar.

import { useRef, useState } from "react";

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
  ExternalLinkIcon,
  FloatingPanel,
  HelpCircleIcon,
  type FloatingPlacement,
} from "@niclaslindstedt/oss-framework/components";
import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";
import {
  NamespaceSwitcher,
  type Namespace,
} from "@niclaslindstedt/oss-framework/namespaces";

import { sessionTitle, type Folder, type Session } from "./session.ts";
import { FooterCollapseRail } from "./SidebarRails.tsx";

// The About dropdown opens up-and-to-the-left of its footer trigger; the
// framework's `FloatingPanel` flips it above automatically.
const ABOUT_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 200 },
  anchor: "left",
  coordinateSpace: "viewport",
};

const SOURCE_URL = "https://github.com/niclaslindstedt/calc";

// The footer-collapse choice persists across reloads under this key.
const FOOTER_COLLAPSED_KEY = "calc:footer-collapsed";

// The build identifier composed at build time (see `vite.config.ts`): the
// version, the CI run number, the deploy slot, and the short commit hash.
const BUILD_LABEL = __BUILD_LABEL__;

// One row of the About dropdown: an external link whose label (and optional
// build-label subtitle) truncate rather than wrap, so a long value can never
// stretch the panel. The shape is contacts' `FooterLink`, trimmed to what
// this menu needs.
function AboutLink({
  href,
  sublabel,
  onNavigate,
  children,
}: {
  href: string;
  sublabel?: string;
  onNavigate: () => void;
  children: string;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-fg hover:bg-surface hover:text-fg-bright"
      onClick={onNavigate}
    >
      <ExternalLinkIcon className="h-4 w-4 shrink-0 text-muted" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{children}</span>
        {sublabel ? (
          <span className="truncate font-mono text-xs text-muted">
            {sublabel}
          </span>
        ) : null}
      </span>
    </a>
  );
}

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
}: Props) {
  const [creatingFolder, setCreatingFolder] = useState(false);
  // Whether the footer (About / Settings) is folded away behind its rail.
  const [footerCollapsed, setFooterCollapsed] = useLocalStorageState<boolean>(
    FOOTER_COLLAPSED_KEY,
    false,
  );
  // The footer "About" dropdown, anchored to `aboutRef` and flipped upward.
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutRef = useRef<HTMLButtonElement>(null);
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
    // The framework panel reserves a bottom safe-area inset as padding so its
    // last child clears the home indicator. That inset sits *below* whatever
    // comes last (the collapse rail when the footer is folded, the footer when
    // it isn't), which reads as dead space. Grow past the panel's content box
    // to reclaim it — the sibling apps do the same — and let the footer and the
    // rail carry their own bottom breathing room instead. Unlike those
    // siblings, calc's shell paints under the home indicator (styles.css), so
    // the room they carry still has to clear the inset.
    <div className="flex min-h-0 shrink-0 flex-col [height:calc(100%+max(env(safe-area-inset-bottom),calc(1.25rem-var(--density-row-py))))]">
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

      {/* Footer collapse rail — a thin, full-width chevron button seated just
          above the footer that folds it away (and back), handing the freed
          vertical space to the session list. */}
      <FooterCollapseRail
        collapsed={footerCollapsed}
        last={footerCollapsed}
        label={footerCollapsed ? "Show footer" : "Hide footer"}
        onClick={() => setFooterCollapsed((v) => !v)}
      />

      {/* Footer: About over Settings, which stays pinned last under the
          thumb. Connecting storage lives in Settings → Storage. Foldable away
          via the rail above. */}
      {!footerCollapsed && (
        <div className="shrink-0 border-t border-line p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            ref={aboutRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={aboutOpen}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
            onClick={() => setAboutOpen((v) => !v)}
          >
            <HelpCircleIcon className="h-4 w-4 shrink-0 text-muted" />
            About
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
      )}

      {/* The About dropdown — portalled and positioned by the framework
          `FloatingPanel`, which sets `minWidth` from the trigger but lets
          `maxWidth` run to the viewport edge. The content is therefore what
          decides how wide the panel lands, so every row here is a truncating
          flex column (contacts' footer-row shape): nothing inside can demand
          width, and the panel stays at the trigger's. The build label
          subtitles the source link, so a bug report can name the exact build
          it came from. */}
      <FloatingPanel
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        triggerRef={aboutRef}
        placement={ABOUT_PLACEMENT}
        className="py-1"
      >
        <div role="menu" className="flex w-full flex-col">
          <AboutLink
            href={SOURCE_URL}
            sublabel={BUILD_LABEL}
            onNavigate={() => setAboutOpen(false)}
          >
            Source code
          </AboutLink>
          <AboutLink
            href={`${SOURCE_URL}/issues`}
            onNavigate={() => setAboutOpen(false)}
          >
            Report an issue
          </AboutLink>
        </div>
      </FloatingPanel>

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
