---
title: Alt Theory information architecture
status: v2
last_updated: 2026-09-15
scope: where user-facing things live, how the major surfaces relate, and which information belongs in each
---

# Alt Theory information architecture

This document is the product rule for adding, moving, or reshaping user-facing
surfaces. It describes architecture and structure, not exact copy, dimensions,
or visual styling. Revise it through product discussion when the structure
changes; do not silently bypass it during implementation.

It is a surface-placement map, not the detailed behavior contract for every
surface. Those contracts remain in the owning Architecture documents, including
[branch and family semantics](branch-family-semantics.md),
[agent behavior and assets](agent-behavior-and-assets.md),
[session import](session-import-adapters.md), and the
[core session engine](core-session-engine.md).

Alt Theory serves two overlapping audiences: people who want to understand a
problem, and people who want efficiency without giving up understanding. The
local bundle must work for non-technical social-science users. Researcher-only
surfaces remain designation-gated and absent for everyone else.

## Governing principles

1. **Put an entry where its product object lives.** Conversation creation,
   list management, message actions, files, and settings each have their own
   home. Do not place an action in global navigation merely because there is
   available space.
2. **Permanent conversation chrome contains conversation configuration.**
   Mode, model and thinking effort, role, knowledge, workspace, and send/run
   controls may live around the composer. Skills and setup workflows do not
   become permanent top-level chrome.
3. **The UI is not a projection of backend schemas.** A control belongs in the
   product only when its intended user can understand it, make a meaningful
   choice, and recognize the result. Folding an internal field under
   "Advanced" does not make it usable.
4. **Show ordinary state quietly; mark only meaningful exceptions.** Do not
   label every common model as reasoning-capable or every ordinary provider as
   API-key based. Surface a distinction only when it changes the user's current
   choice or explains an exceptional state.
5. **Keep live choices current and make consequential silent changes visible.**
   The effective model, thinking effort, mode, workspace, approvals, and run
   state must not silently contradict the user's last visible choice. Stable
   identifiers and paths remain available on demand rather than occupying the
   default view.
6. **Use the agent for complexity after a minimal bootstrap.** Before any model
   works, the product must offer a short deterministic path to one usable
   provider and model. Once Alt can run, complicated provider setup and
   recovery should be assistable through the help skill rather
   than teaching protocol details in the settings UI.
7. **Promises are statements, not features.** Stable assurances such as local
   storage belong in first-run/About copy, not as permanent controls.
8. **Keep follow-up choices near their trigger and preserve spatial stability.**
   Lightweight confirmation, a single-value setting, or a secondary action
   should complete at the object the user just clicked. Prefer an anchored menu,
   same-row replacement, or stable inline selector over a distant modal or an
   expanding panel. Revealing a choice must not move its trigger under the
   pointer. Use a modal or expanding form only when the user must read substantial
   consequences or provide additional information.

## Surface map

- **Current application shell and desktop frame** (A2 trial; implementation
  fact, not a settled product principle)
  - One app-root Left rail and resizer is shared by the conversation and
    Settings surfaces. Settings replaces the center/right work area; Review is
    full width. The conversation subtree remains mounted but hidden while
    either surface is open, preserving drafts, DOM editing state, and undo.
  - `lib/pane-layout.ts` owns every outer width (Owner 2026-11-01);
    `lib/usePaneLayout.ts` connects it to device preferences. `Shell`
    measures the actual root with a ResizeObserver and supplies resolved CSS
    widths. Resize hit targets overlay card edges without consuming layout
    width.
    - The right pane is a share of the center+right work area (40% at
      every app start; a drag sets the share until restart and is not
      saved). The two shrink together as the window narrows, and changing
      what the right pane shows never changes its width.
    - When center+right (counted with the left open) would be under 700px
      (left again at 724) the left column docks as its icon strip; expanding it floats the full column over the work area. Opening
      a conversation, a surface or a settings tab, clicking outside or Esc
      closes the float. A manual collapse on a wide window is the saved
      preference; the float is not. The right pane never moves the left
      column.
    - Full width (right pane header, far right, a horizontal-arrows icon):
      the right pane takes the work area,
      the center is hidden but stays mounted, and the left docks as its
      strip. Restore, closing the right pane, or opening anything in the
      center ends it.
    - The right pane header's top right holds, before Full width, what the
      thing on show can do (Owner 2026-11-27, `shell/PaneActions.tsx`):
      Show in the center (blue) and a ⋯ menu — the Related chip's menu for a
      conversation, the tab's menu for an open file. Nothing else shows them,
      so they appear only for a conversation or a file on show. A Related
      conversation has no header row of its own; Show in conversation list
      lives in ⋯, and the first unlisted one on show says so once.
    - Show in the center (Owner 2026-11-27, `MainView` toCenter): a
      conversation replaces the center's and a file covers it, inside the
      same desk — no desk is added. The center then offers one step back
      ("← name") to the conversation before, or under the file; opening from
      the list or starting a new conversation drops it. A desk keeps this
      while off show, and a desk with a file in its center is named by the
      file.
  - The brand logo shows global work in flight: the existing blue shimmer and a
    quiet count badge include running and awaiting-approval conversations. One
    BrandMark renderer serves expanded/collapsed conversation and Settings rails,
    using pushed list activity without another subscription. The badge does not
    change header geometry; zero clears both effects. Reduced motion uses a
    static blue mark. The former separate running-count row is removed.
  - The desktop bundle uses a hidden window title bar. Windows/Linux draw the
    system window buttons into the app's top band and have no application menu;
    macOS keeps its traffic lights and a trimmed localized system menu for the
    standard app, edit, view, and window shortcuts.
  - Settings > General exposes six bundle-only **View size** stops (80–150%).
    Electron applies whole-window zoom and persists the chosen stop; the web
    app has no native bridge or duplicate setting.
- **Composer and empty state**
  - Empty state is the greeting and the composer; Native Pi adds a short note
    about its normal tools.
  - The composer's shield holds the conversation's **permission** (Read-only,
    Ask for approval, Smart approval — marked experimental, naming which model
    reviews — and Full access; local only; Strict smart approval joins them
    with Settings > General > "All approval modes (advanced)", and stays
    listed on a conversation already using it). While a conversation is on smart
    approval with the auto reviewer, a line above the composer says so, with
    a way to Settings and "Don't show again". The first-level paperclip
    adds a file by copy (into the conversation's folder, preserving the original
    format) in every conversation. A pasted file or image does the
    same. Both composers accept file drops. A desktop drop links the
    original in both independent and project conversations, regardless of
    permission. Reading it uses the ordinary file-access policy. Browser drops
    without a local path attach a copy. Attachment insertion does not convert
    files; the agent can use the fallback `convert_document` when needed.
  - Live composer chrome carries permission, model and effective thinking effort,
    role, knowledge, workspace context where applicable, and run controls.
    Its toolbar stays on one line: as the composer narrows, the permission
    name and then the model name fold into their icons. The center column
    keeps a 400px minimum; the right pane gives way first.
  - An approval waiting on the user sits above the composer: a small head
    naming the kind of action, the command or path itself in its own wrapped
    block (scrolling when long), and the choices below it. Under smart
    approval a tool row carries the reviewer's verdict and reason.
  - The strip above the composer is a **switchable card slot**, one card at a
    time. Role/knowledge is the session-initial card: a traditional control
    (functional view) tied to how the conversation was set up (session-
    lifecycle view). Steer is the in-process, situational card: it acts on the
    next few messages, not on the session's identity. The slot is not limited
    to these two cards. It is drawn as a deck (Owner 2026-11-26,
    `ComposerDeck.tsx`): the front card full width, the others' spines on the
    right showing their icon and, on hover, their name (after the pointer
    rests 0.2 s, so passing over does not move them); a click brings one
    forward. The handle at the front card's left end puts the deck away to
    the right (click, or drag right past a third), leaving a tray with each
    card's icon that opens that card. A spine or tray icon turns blue while
    its card has something switched on. A new conversation shows only the
    role/knowledge card.
  - The composer card has a fold handle at the middle of its top edge (Owner
    2026-11-27; click, or drag down to fold and up to unfold). It is hidden
    until the pointer rests on the card while the message is not being typed,
    or rests on the handle itself; the next choice was the top-right corner. Folded, it is
    one line: the message and the send / stop / continue button; the tool
    row waits until it is unfolded. The text still grows to several lines.
    The deck folds on its own; the state is kept per device.
  - Steer offers bundled Alt Theory skills only; each chip's tooltip states
    that skill's own job, while what "steer" means lives on the card's lead
    icon. An active chip shows its remaining turns as dots; a locked one is
    filled blue.
  - Import may appear as a quiet conversation-creation action.
- **Model menu**
  - Shows the effective model and, where supported, the effective thinking
    effort.
  - The active provider's models are directly visible. Other providers appear
    by provider first, then model.
  - Thinking effort is a second-level choice for the selected model, not a row
    of protocol metadata.
  - A compact filter matches provider, model name, and model id without changing
    the saved provider lists.
  - The menu links to Settings > Models without losing the current draft.
- **Toolbox and slash palette**
  - The toolbox contains a small curated set of common capabilities.
  - The slash palette is the complete home for skills and commands.
  - Skills do not receive permanent navigation entries merely because they are
    installed.
- **Messages**
  - User and assistant text nodes have a trailing three-dot menu after all
    existing actions. Its experimental Bookmark action saves the node and opens
    a small note card beside the trigger. Saved nodes also carry an independent
    top-right bookmark entry; it and the menu open the same card. The card's
    top-left icon toggles bookmarking (solid blue when saved, an outline when
    unsaved), keeping its draft text while open. Notes save after a typing pause
    and when closed; the menu also retains a remove-bookmark action.
    There is no separate note action, collection page, tag UI, or export UI.
  - On an ordinary user message, the pencil means **Edit and compare**, including
    while its answer runs. Editing
    stays in the user bubble; Send preserves the original and runs the edit in
    a sibling conversation.
  - After an interrupted turn, the composer quietly offers Continue and Retry.
    Continue resumes from the breakpoint; Retry starts the same prompt again.
    Editing replaces the interrupted attempt in the current conversation. None
    of these recovery actions branches; `/branch` remains explicit.
  - `Adjust model or role…` is a branch icon next to Edit and a text button in
    the edit state. It opens an idle Related branch forked before that user
    message, with the original prompt or current edit in the composer. The user
    can change configuration before Send.
  - `Retry` reruns the latest user message from the start in the same visible
    conversation, whether the previous answer completed or was stopped. It does
    not create a Related child or list branch. Automatic provider retry remains
    runtime recovery, not this user action. During a run it stops and settles the
    current attempt automatically before retrying. Inherited Branch/import
    messages are eligible even without local run records.
  - Skill selection completes the draft without sending or replacing its text.
    A selected skill appears as a removable chip; the shared prompt path carries
    it with attachments or through Pi's running queue. The transcript preserves
    the invocation and Pi's stored skill body as a collapsible entry.
  - Traditional Branch is the second-level `/branch` command, not a message
    button. It opens an idle Related branch without sending.
  - Resolved conversation permissions do not become transcript events. When
    retained for inspection, they live collapsed in advanced Runtime.
  - Thinking, tool activity, compaction boundaries, and connection/run states
    render as conversation events, not settings.
  - A message sent during a run appears first as a Pi-queue card. Edit recalls
    it to the composer and Delete removes it without stopping the run;
    **Interrupt & send** stops the current answer and sends the selected entry
    next, with the remaining entries following afterward. A user bubble appears
    only when Pi starts that queued user turn, not merely because a card
    disappeared.
  - Reader marks (`lib/marks.ts`, `conversation/useMarks.tsx`): a selection's
    menu (right-click, or the small triangle that appears just above where a
    selection ends) highlights, underlines or strikes it through; the first
    few triangles also say so on the notice line, until a mark is made. A
    mark's menu opens on right-click or a plain left click (a drag still
    selects, a double click still selects a word): recolor, note, remove. A
    mark's note and a bookmark's note open the same card
    (`conversation/NoteCard.tsx`); a noted mark shows a small dot after it,
    its note on hover.
- **Conversation list**
  - Conversations with a project main folder are grouped under that project;
    folderless roots live in a separate collapsible **Independent
    conversations** section, listed above the Projects header (Owner
    2026-09-25). It previews five family heads, followed by Show all when
    there are more.
    A project group carries the project's name
    (default: the main folder's). Its tooltip lists the main and companion
    paths; companions are not separate rail rows. The group menu offers Add
    folder and Manage folders actions.
  - Desks (工作位; Owner 2026-11-26, `lib/workspaces.ts` — the code keeps the
    name workspace): places the user
    stays in and switches between, always listed at the top of the list in a
    flat light-blue block, the one on show a step deeper (title, where it
    lives, close on hover). Each keeps its center
    conversation and right pane; only the one on show is live, so switching
    reopens its conversation and restores its right pane (`restore` pane
    action). A plain list click stays in the current workspace unless the
    Settings › General "New desk" choice says it crosses — across
    projects (default; standalone conversations are one place), across
    families, every conversation, or never — and then goes to the workspace
    already holding that place, else a new one. Cmd/Ctrl+click and the row
    menu's Open on a new desk always open one. Nothing restricts which
    conversation a workspace holds. Desks show in the list, as a card on
    the composer's deck, or both — never neither; right-click on either
    chooses (`components/shell/Desks.tsx`, kept per device). The list's block
    folds upward by its bottom grabber (click, or drag up) into a row of
    dots, one per desk, the one on show drawn long; a dot opens its desk.
    With Desks shown in the list, the tool row, the search when open, and the
    Desks block read as one light-blue card (Owner 2026-11-27); while a
    filter hides the desks the card ends at the search. The list's search
    field is the Files search's field.
  - Pinned (Owner 2026-11-26): a row menu pins a conversation; pinned rows
    show in their own section above the list, in pin order, and stay in
    their place below. The section exists only while something is pinned
    and has no collapsed-strip icon. The Desks section sits above the
    scrolling list, so it stays in view and the list's scrollbar starts below it. Pins and the workspace choice live in
    app settings (`/api/settings/navigation`). The row's "…" menu and its
    right-click menu are one item list.
  - The highlighted row is the conversation the user opened or created, and
    nothing else: a fresh app launch or a new-conversation draft highlights
    no row (Owner 2026-09-24); a list refresh never picks one.
  - The Projects header owns project-only collapse all, expand all, add, and
    sorting. Conversation files and Search sit in the new-conversation row's
    control group, left of the new-conversation button (Owner 2026-11-27:
    the pane's own tools in one row), and filters projects and the Independent
    conversations section alike. These controls do not change
    conversation-family folding or the Standalone conversations section's own
    collapse state.
  - The search field switches between **Names** (title, project folder name
    and summary metadata, with unordered word matching; a query containing
    `/` or `\` also matches full folder paths, and a pasted absolute path —
    quoted or containing spaces — matches by its last segment) and
    **Content**. Content
    searches non-Trash conversations across projects on demand, subject to
    both summary and content access checks. It matches only current visible
    user and assistant text, excluding thinking and tool rows, and filters the
    existing list without snippets or message jumps. A matching attached
    conversation that is not normally listed appears temporarily under
    Related matches with its family context. Opening it places the nearest
    available listed ancestor in the center and the match in the right pane;
    clearing search leaves its list identity unchanged.
  - An expanded family previews five descendants in list order, keeping the
    selected branch and its ancestors visible. Larger families offer Show all
    and Show less. Search bypasses the preview. The family chevron still
    collapses or expands its descendants without changing list membership.
    Session identifiers and local session-folder paths remain
    available on demand through the row actions rather than default labels.
  - Root conversations and Branches (purpose `fork`) have the same functional
    status: both are first-class conversations that users may compare, keep, or
    delete independently. Deleting either never deletes its parent, sibling
    Branches, or child Branches. This independence exists because facilitating
    comparison is a core product purpose.
  - **Delete entire family** is a separate consequential action. It moves every
    member of the lineage tree to one recoverable Trash item; ordinary Delete
    keeps its existing single-conversation semantics.
  - Side chats, subagents, and provisional comparison arms do not become
    ordinary list rows unless the user promotes them. Branches are
    list members by nature.
  - BTW and subagent conversations are attached to their family. **Show in
    conversation list** and **Hide from conversation list** change identity and
    lifecycle membership for those children, not merely their display. Legacy
    Helper children read as listed side conversations; legacy root Helpers read
    as ordinary roots.
  - Related children in the list or Related switcher show a **lineage-marker
    prefix plus the real title**, not a rename: the marker is the machine token
    from `lineageMarker` — e.g. `br1 · …`, `br1-btw2 · …`, `sa1 · …`.
    Numbering is per parent + purpose. Do not
    overwrite `ui-alias` to a bare token like `branch1`.
- **Right rail**
  - Holds files/changes and one selected related conversation (Branch, BTW,
    or subagent). What it shows beyond a rail's list is a typed
    target (`lib/viewTarget.ts`): a conversation, a local page, or a record;
    a file is an open file (next bullet). Every target names the
    conversation it belongs to and is drawn against it: switching the center
    conversation leaves an open target as it was, scroll position included —
    an open file is still that conversation's file, and attaching it adds it to
    that conversation's message. A rail's list (Files, Changes, Related,
    Records), the Related switcher strip, and the Provenance rail
    show the center conversation. The rail is one global view for now (Owner
    2026-09-24); the target type does not name it, so a tab or a split could
    show the same targets.
  - Open files (Owner 2026-11-25): a file opened from Changes, from Files or
    from a link in a conversation becomes an open file instead of replacing
    the entry's list, which keeps its position, filter and expansion. Open
    files are collected on the Open files rail entry, below Files, with their
    count on the rail and in the header: one chip per file at the top of the
    viewing area (`components/inspector/OpenFilesPanel.tsx`) and the file on
    show below it. A file is one open file whichever entry it came from (the
    same absolute path), and its last entry decides what it shows: the change
    for Changes, the file otherwise. Back returns to the entry the file on
    show came from. A file that is not on show stays mounted, so its scroll,
    zoom and open editor are as they were when it comes back. The file chips
    and the Related chips are one strip (`components/shell/TabStrip.tsx`,
    `.child-switch`): no scrollbar and one height; it scrolls by wheel,
    trackpad and the arrow keys, with a partly visible chip at an edge.
    Deleting a conversation drops its open files too.
  - Bookmarks (Owner 2026-11-26, `components/inspector/MarksPanel.tsx`): the
    rail entry below Open files lists the conversation's bookmarks and text
    marks as cards (`GET /api/sessions/:id/marked`). This conversation is
    always in; Extend to Family / Project / All widens it (Project only for a
    conversation with a main folder), and the extension and arrangement
    stay as the center changes. One conversation defaults to By time (one
    stream in conversation order), an extended scope to By source (a group
    per conversation, this one first); the user may pick either. A card
    shows who said it, the node's text for a bookmark or the quote styled
    as its mark, its note, and the latest message when the
    bookmark was made; text is capped at five lines with Expand. Clicking a
    card shows that row in the center (opening its conversation through the
    list's workspace rule) and flashes it; dragging a card carries
    `conversation:<id>#<row>`, the quote and the note as plain text.
    Make a note writes the list as shown (scope, arrangement, search) to a
    new Markdown note where New note puts one, once, and opens it
    (`lib/markedNote.ts`, after Zotero's note from annotations): per
    conversation a heading (its name, or its opening words in quotes), each
    entry's sign (bookmark, color, underline, strikethrough), speaker and
    link, a whole bookmarked message quoted in full, the note under it, and
    rules between entries. A `conversation:<id>#<row>` link in any rendered
    Markdown opens that conversation and shows the row.
  - Branches (purpose `fork`), BTW and subagents open in this rail at the
    pane's current width.
  - Navigation has one owner, `ShellContext`, which changes one state only
    through `navigate` (`lib/viewTarget.ts`): open a target (on its own rail),
    Back, open a rail, a rail button, collapse, reopen the collapsed pane (drag
    or keyboard, on the rail open last), reveal-in-files, and forget deleted
    conversations. Side conversations open from the conversation module's
    events (a branch or BTW created), the Related list and switcher,
    search hits and the approval notice — each calls `openTarget`.
    Deleting conversations drops their targets from the view (it shows the
    rail's list), from each rail's memory and from the way back.
  - A Related conversation uses the same history, live thinking/tool rendering,
    approvals, skills, and slash commands as the center. Role stays above the
    composer; model and permission sit in its bottom toolbar. Both panes share
    edit/compare and retry actions. Comparisons created from either pane open in
    the right pane. Show in the center changes the display position without
    promotion or stopping the conversation. Both panes share
    the permission picker and toolbar width rules: permission labels fold below
    460px and model labels below 360px, retaining their icons.
  - A pending approval in another conversation produces one global notice on
    every surface, including Settings. The notice does not approve in place: it
    returns to the owner. Roots and Branches open in the center; BTW and
    subagents open beside their parent in the right rail. The approval panel then
    appears in that owning pane. In the application shell the notice sits in the
    lower action area above the composer instead of covering transcript content.
  - Center multi-arm A/B comparison stays on Workbench compare surfaces only;
    branches must not open a second center-column “compare pane.”
  - File preview occupies the rail as a real reading surface; rendered Markdown
    is the default for non-technical users, with source available on demand.
    One renderer serves the open files and Records
    (`components/inspector/FilePreview.tsx`): the control follows the file
    type (`lib/fileContent.ts` `previewModes`). Changes starts in Diff when
    available. Files and conversation links start in Rendered or Source.
    HTML renders in a sandboxed iframe. A file may also have an Edit mode
    through its scoped save address. Desktop viewing uses the chosen path
    directly, including files outside project folders.
  - Markdown links resolve against their owning conversation and, in an open
    file, that file's directory. A desktop conversation link without a base
    tries the project folder, then the conversation workspace. In the desktop
    app, a supported file opens in the shared file preview. If a file cannot
    be previewed, the preview offers a system open action. The file tree lists
    files independently of their preview format. New note (Owner
    2026-11-26), beside the Files filter, takes a name (default
    "Untitled" plus the date — `2026年11月26日` in Chinese, `26 Nov 2026` in
    English so day and month never swap; no extension means `.md`, a taken name gets " 2") and
    creates an empty file at the top of the main folder — the conversation
    folder when there is no project — opened in Edit. A file in a working
    folder or the conversation folder renames from its tree row or open-file
    tab menu (`workspace-files.ts` `createWorkingFolderTextFile` /
    `renameWorkingFolderFile`); attachments keep their names, and an open
    copy follows the rename. HTTP/HTTPS loopback links open a `page` target on the Files rail with
    an interactive iframe and a default-app action; Back restores what it
    replaced. Other web links open externally. Link selections copy their
    destinations as Markdown in plain text and keep HTML links in rich text.
  - An open preview is a reading snapshot. Refreshing the file tree, Changes,
    or conversation list does not remount it or replace an unchanged rendered
    body. Selecting or reopening a file reads the current content unless an
    in-memory draft for that session/root/path (text whose save had not
    landed) resumes. This keeps text
    selection and edits stable during background conversation refreshes without
    adding a general live-file subscription.
  - Edits save automatically (2026-09-28): a second after typing stops, and
    at once on blur, Ctrl+S, or leaving the file; a quiet line under the
    editor says "Saved." (or why not). Until the file closes, Ctrl+Z walks
    back to how it opened. With no unsaved text, the open file reloads when
    any conversation finishes a run, if its version changed. Each save checks
    the file's last known modification time; a conflict pauses autosave and offers discard, save a
    copy, or overwrite. Unlanded text survives rail and conversation switches
    in memory but not an app restart. See
    [ADR 0007](adr/0007-separate-user-file-edits-from-agent-write-permission.md).
  - Changes lists the whole conversation family's writes (subagents and
    branches included), merged on the resolved absolute path and grouped as
    prototype D groups them: each project folder (main, then each companion
    folder) is one group, never subdivided; everything outside groups by
    containing folder with a depth cap of three levels below home or the
    drive root (`session-store.ts` `groupChanges`,
    `CHANGE_GROUP_DEPTH_CAP`). Every group is titled by the deepest common
    ancestor of its files; rows show paths relative to that title, and a group
    that absorbed deeper folders says so in one muted line.
  - Changes counts only successful `edit` / `write` / `create` / `multiedit`
    tool calls on each member's current branch; files made by commands do
    not appear (a muted line under the list says so). Each change carries
    `touchedAt` (its last write's entry time, latest across the family) and
    `sessionIds` (who wrote it). The server's order is merge order; the
    panel orders client-side (`lib/changeList.ts`, issue 2026-10-12): by
    folder (default; groups as above, newest change first inside each),
    recently changed (flat), by agent (one section per writer, most recently
    active first) or name, and filters by agent (all, this conversation,
    running members, or picked members). Rows name their writers when more
    than one member wrote. The list re-reads when the center's run settles,
    when any family member's list activity or `updatedAt` moves, and every
    10 s while a member runs.
  - Changes and Files share one folder chrome (Owner 2026-09-24): an
    always-visible filter and Expand all / Collapse all on top, and one folder
    header — folder name plus its role (Main / Companion / Global folder,
    Outside) as quiet grey text on the first line, which folds the folder, and
    the full path on the second, which reveals it in the file manager in the
    desktop app. While a filter is active, matches show even in folded
    folders. Changes and Files match each file's or folder's own name by
    default; a query containing `/` or `\` instead matches consecutive path
    segments ending at that item. A matching folder is a result in its own
    right, without making all descendants matches.
  - Right-pane view state outlives the pane (Owner 2026-09-03). The
    navigation state remembers, per rail, the last open target and restores
    it when that rail reopens after a collapse or switch; when a target on
    another rail takes the pane over, Back returns to that rail and its
    target. View state that must survive an unmount has four homes, each for
    its own kind: the navigation state above (what is open, and the way
    back); `lib/paneMemory.ts` (`usePaneMemory`, an app-lifetime map keyed
    per conversation and surface: tree expansion, filter text, view mode,
    related-pane filters, per-view scroll position, the Records selection;
    a deleted conversation's entries are dropped, and loaded Changes diffs
    are kept for the last 8 conversations);
    `lib/fileDrafts.ts` (unsaved file edits); and `lib/find.ts` (which column
    Ctrl+F serves). None of these persists across a restart; composer drafts
    are the conversation's own (see Conversation drafts).
  - Changes, Files and Related put their sort (and filter) cards on one
    row (`FolderList.tsx` `MenuButton`, choices in the context-menu shell).
    Files orders by name (the trees) or recently modified: each working
    folder's 200 newest files flat (`GET …/files?root=working&recent=1`,
    `workspace-files.ts` `recentWorkingFiles`), the filter narrowing those.
    Related sorts its kind rows by recent activity (`updatedAt`, default),
    creation order (the saN / brN marker order) or name, with a Running
    filter; the ancestor chain stays first and a search ranks by relevance.
    The strip above an open related conversation uses the same filtered/sorted
    rows. Its right-hand caret reveals the existing controls, initially hidden;
    Escape closes them while focus remains in those controls or the strip.
  - Files has one inline filter above the existing tree. It keeps matches and
    their ancestors in that tree, expands those ancestors while filtering, and
    restores the prior expansion when cleared. Selecting a matching folder
    temporarily shows the ordinary tree with that folder expanded and in view;
    the query remains visible but inactive. The in-field Back returns to the
    results, while Clear leaves the ordinary tree. Escape returns from the
    folder to results first, then exits search; in other file lists it exits
    search at once. File-change rows may reveal the
    same path here; for files, path copying and file-manager reveal live in
    contextual actions rather than permanent labels.
  - Ctrl+F acts on the column the user last touched (Owner 2026-09-24). A
    list of things to open (the conversation list, Files, Changes, Related)
    focuses its own filter; opened content (a conversation, a related child, a
    file preview) gets a floating find bar with a count and next/previous.
    It searches once typing pauses (never mid IME composition) and steps
    through at most 1000 matches; beyond that the count reads "1000+".
    Clicking a conversation row counts as touching the center. Nothing happens
    in Settings or Review, while a modal dialog is open, or on a rendered HTML
    file. The file editor is searched too (2026-09-28): while the bar is bound
    to it, a transparent mirror of the text under the textarea carries the
    matches, and closing the bar selects the current match in the editor.
    Escape typed in that editor closes the bar (the caret stays); over about
    200,000 characters the bar notes in grey that typing is slower while
    searching.
  - Contextual menus stay open while unrelated panes receive output or scroll;
    scrolling the menu's own anchor pane still dismisses them.
- **Settings**
  - General: app behavior and ordinary preferences, including the permission
    cards — the default for new conversations (with the "All approval modes
    (advanced)" switch), commands that run without asking, and the smart
    approval reviewer (auto or a model chain, with the
    dated recommendations) — and auto-naming's model chain.
    Thinking blocks are always available; **Expand thinking** remains a preference
    controlling only their initial expansion. Model reminders are enabled by
    default, with `modelHooks` retained in `data/app-settings.json` for manual
    configuration and no UI switch. The participant opt-in and settings page
    have been retired from this client.
  - Models: provider connection, model choice, and model capability correction.
  - Projects and global folders (v1.5.1): two cards. Projects — each its own entity
    with a generated id, an editable name (defaults to the main folder's
    name), a changeable main folder (picker + confirm; every conversation
    of the project moves, one running conversation refuses with nothing
    written), and companion folders (add / remove); Global folders —
    folders Alt may read in every conversation, one quiet eye line above
    the rows saying they are all readable, each row name, path, an Edit
    tick (saves only in Work) and remove. No per-row badge, no mechanism
    words. A project whose main folder is missing on disk stays listed with
    a quiet line; starting a conversation in it is refused. Stored in app
    settings (`workingFolders.projects`), applied through the root policy
    as `global-list` / `project-secondary`; the explicit working-folder
    registry (`knownWorkspaces`) is derived from projects.
  - Role & Knowledge shows role and knowledge icons and the user-role storage
    path. Skills can add/remove referenced folders using Pi's settings `skills`
    paths and loader; the files stay in their original locations.
  - Help center: a curated capability guide and the shipped localized tips.
    The global Help menu opens either this surface or an ordinary new-conversation
    draft prefilled with `/skill:at-alt-theory-help`. The user adds a question and
    sends it; the normal draft settings and first-send validation apply.
  - Trash: deleted conversations remain recoverable for 30 days. Restore and
    permanent-delete actions live here rather than in persistent conversation
    navigation. Permanent conversation deletion removes conversation/session
    records, including a managed import-source copy, but not attachments or
    working files.
  - Versions: a persistent left-rail entry (also an icon when collapsed) opens
    one window for bundled release notes, major-update history, available updates
    and manual checks. Major-update history is bundled Markdown under docs/en
    and docs/zh-Hans, rendered with the existing notes styles and scroll area.
    Long-content selection uses i18n.localizedContent: exact language first,
    then Simplified Chinese for missing Chinese translations, then English.
    About links to that same window and keeps storage information. Upgrades show
    the installed version's bundled notes once; fresh installs establish a
    baseline without opening notes. The acknowledged version lives in the
    existing app settings. After a successful automatic check,
    the Electron bundle waits 24 hours before another automatic GitHub release
    check (prerelease builds may see newer prereleases; stable builds do not).
    The explicit Versions action may check immediately. Successful results and
    release notes are cached; an available update marks the Versions entry.
    Background offline or rate-limited checks stay silent and do not advance
    the last-checked time; explicit checks report failure. Download links
    open only on GitHub.
  - Opening Settings or Review hides the mounted conversation instead of
    unmounting it, so browser undo history and DOM editing state survive the
    round trip (v1.4.7). The composer draft itself belongs to its conversation
    and is kept on this device (see Conversation drafts below).
- **Researcher-only surfaces**
  - Inspector, comparison, provenance, and study controls are
    designation-gated and have zero presence otherwise.

## Model and provider configuration

### User mental model

- A **provider** connects Alt to an AI service.
- A **model** is a choice available through that provider.
- A model's **supported thinking levels** are provider-specific capability
  metadata. Alt obtains them from the maintained models.dev catalog used
  upstream by OpenCode and Pi, with a short cache and explicit user correction
  as the override. `reasoning: true` alone never implies a universal level set.
- A model may **think without having effort levels** (only on/off). Pi's
  shipped definitions and models.dev say so automatically when they know the
  model; the settings page's *No thinking effort levels* says so for
  the rest. Such a model is sent on or off, never an effort; where not even the
  switch format is known, nothing is sent and the provider's default applies.
- A model's **recommended initial effort** is model metadata when a reliable
  upstream supplies it; it is not an app-wide user preference.
- The **selected thinking effort** is conversation state. It is chosen in the
  composer/model menu from the levels supported by that model.
- A provider's saved model list is the user's configuration and is authoritative.
  Live provider results may propose additions through an explicit Fetch; bundled
  Pi model lists are offline bootstrap metadata only. Neither may silently add,
  remove, reorder, or replace models after the user saves.

Do not collapse these concepts into one settings form.

### Settings > Models layout

The Models surface uses a master-detail structure:

- The left side is a compact list of existing providers.
- Selecting any provider opens its editor in the right detail area; do not
  require the user to find a small Edit button.
- **Default model** for new conversations is controlled only from an explicit
  control at the top of Models (overflow/summary of the active default).
  Choosing a model inside a provider editor does **not** silently set default.
- The default is only a fallback when a conversation has no explicit model.
  Runtime resolution is conversation selection, then configured default, then
  the ordinary no-model condition; a valid manual choice never requires a
  default to exist.
- A stale default is repaired to a usable saved model when possible, or cleared.
  Opening and browsing remain available with no model; Send is the boundary that
  requires one.
- Under the **Models** heading inside a provider editor, **Add model**,
  **Fetch model list**, and **Test connection** sit **above** the per-model
  rows so Fetch is findable.
- Fetch and Test report pending, success, no-change, partial, and understandable
  failure states in one inline row directly below those actions.
- OAuth-connected providers sort before ordinary API-key providers.
- A saved OAuth provider that is connected opens as a manage view
  (**Connected.**, Disconnect, Sign in again), not a sign-in flow. Sign-in /
  **Reconnect** is for a failed refresh (the warning notice on Models) or when
  the user chooses Sign in again. Its fixed Base URL, protocol/API adapter, and
  API-key plumbing are runtime invariants, not user settings, so they are not
  displayed (including under Advanced).
- OAuth-connected providers may carry the single low-key word `OAuth` in the
  provider list. Ordinary API-key providers need no corresponding badge.
- A visually clear `+ Add provider` action opens the add flow in the right
  detail area.
- Directly under Add provider: a low-key entry to the chatbot/agent model
  configuration guide (docs: configure-models-with-chatbot).
- With no providers configured, the add flow is open by default.
- Fetch never waits for models.dev. OpenCode Go splits its shared model endpoint
  into Chat Completions, Responses, Anthropic Messages, and Gemini lists using
  current route corrections, bundled Pi metadata, saved classification, and the
  local catalogue. A model returned by the selected provider endpoint
  is still offered when those metadata sources do not know it; missing metadata
  is reported, not treated as evidence that the provider model does not exist.

Provider rows do not enumerate context windows, output limits, reasoning
flags, costs, modalities, or metadata provenance. Those facts do not help the
user scan or choose a provider; they live in the provider editor and after
Fetch.

### Composer and related conversations (alpha.6 follow-up)

- Run tips while a turn runs rotate every **10s** (after a short first delay).
- Related/branch switcher in the right rail is horizontally scrollable (CSS
  overflow + **mouse wheel maps to horizontal** when the strip overflows);
  clicking a child opens it explicitly.
- When a related child is open, the outer inspector body does not double-scroll
  the conversation area.
- Main and related composers stay **visually the same card height** when
  side-by-side. Related is a compact variant of the same conversation surface:
  it keeps slash commands, skills, model, role, and permission. Both composers
  grow with their text up to about eight
  lines and re-measure when their width changes.
- v6 serve uses static `web-server/public-v6` — frontend source changes require
  `npm run build:frontend-v6` before they appear in `dev:web` / `dev:web:local`.

### Add provider

The right-side add flow is flat rather than a stack of nested cards:

1. Pi-native OAuth/auth options supported by the product;
2. one quiet divider;
3. recommended API-key provider presets;
4. agent-assisted or manual custom setup as secondary paths.

OAuth choices appear before API-key presets. Preserve Pi's supported auth
capacity rather than implementing another credential system. Claude
subscription login is not a supported product entry; Anthropic API-key
providers remain possible.

Once at least one usable model exists, complicated setup should offer an
**Ask Alt to add a provider** path through the help skill. Manual configuration remains
available for users who deliberately seek it, but it is not the default
teaching path.

Before Alt can run, the add flow may instead link to the public setup guide and
its copyable prompt for getting help from another AI.

Model setup never replaces or detains the main application. With no usable
model, the normal shell remains open and the composer notice area explains the
condition. Settings > Models is primary; a secondary action opens an in-app
copy of the same external-AI setup prompt shipped in the docs, without sending
the user away to find it. Models uses that shared frontend content too. Any
optional onboarding entry routes here; there is no second provider editor.

### Edit provider and model

The normal provider editor focuses on actions the user can understand:
connection state, available models, active model, refresh where meaningful,
and save/delete actions.

An intentionally opened advanced model editor may correct model capability
data that affects runtime behavior, including:

- model id and display name;
- context limits;
- supported thinking levels and their provider-specific value mapping;
- recommended initial effort when it needs a manual correction;
- other human-understandable capabilities only after a real correction use
  case exists.

The advanced editor is not a raw compatibility-schema editor. Wire-format
fields such as `thinkingFormat` and
`requiresReasoningContentOnAssistantMessages` belong to presets, adapters, or
Pi metadata. They are not understandable user choices and must not appear in
the normal or advanced product UI.

### Conversation model and effort

- A model selected before the first message remains visibly selected and is
  used when the conversation materializes.
- The composer shows the effective thinking effort, not an ambiguous unset
  value.
- A new draft without an explicit effort orders that model's actual supported
  non-off levels and chooses the positional middle; for an even number of
  levels it chooses the lower of the two middle values. When no levels are
  known, the current fallback is `medium`. Do not equate the literal label
  `medium` with the middle of an expanding level set.
- Only levels supported by the selected model are offered. A model may expose
  none plus a small set such as high/max, while another may expose several
  levels.
- Reasoning models whose upstream metadata exposes only automatic/toggle
  reasoning, or no effort variants for that provider, do not receive a
  fabricated effort menu.
- Editing supported levels in model settings changes the available choices;
  choosing the current effort remains a conversation action.
- No model switch, fallback, or reset may be silent.

### Conversation drafts

Every conversation has its own draft — the composer text and the staged
files — and so does the new-conversation screen (M2, 2026-09-24). A draft
belongs to the conversation, not to where it is shown: the center composer and
a side-pane child show the draft of the conversation they display (a side
pane takes input only once that conversation is open), so switching
conversations shows each one's own draft, two places showing one
conversation share one draft, and closing and reopening a side conversation
finds its draft again. The drafts live in `lib/draft.ts`, one per
conversation key (a session id, or `new`).

- **Kept on this device.** Switching, opening Settings or Review, reconnecting
  and restarting the app keep every draft (localStorage — the browser already keeps it per server). Another window of the app on the same
  device reads a draft again when this one saves it. Nothing is synced
  between devices.
- **Written shortly after a change** (and at once when the page is hidden). A
  write that fails is said in the composer ("could not be saved on this
  device"); it is never treated as saved. There is no eviction: unsent text is
  never dropped to make room.
- **Ends** when it is sent, when its conversation is deleted or no longer in
  the conversation list (a draft opened in this run is never taken that way),
  or on sign-out.
- **Sending** clears the text and the files that went with it (a help
  question carries none, so staged files stay); if the send is refused or
  lost (the socket dropped and the re-opened rows do not have it), the text
  and files go back into the draft of the conversation they were sent from,
  with a one-line notice — not into whichever composer is on screen. Stop's
  unsent queue and a queued message taken back to edit go to their own
  conversation's draft the same way; a Stop seen by two windows of the
  conversation is taken once. A file imported into a conversation is staged
  in that conversation's draft even if another one is open by then.
- **Restored drafts are checked** once per app run: staged files that are
  gone, and the new-conversation draft's folder if it is gone, are taken out
  with a notice (local form only).
- The file editor's unsaved edits are a separate, memory-only draft store
  (`lib/fileDrafts.ts`, see the file preview above).

### Draft-to-live continuity

Before the first message, model/effort, role, knowledge, permission (mode and
Full Access), visibility, workspace, study tag, and attachments are one coherent draft —
the new-conversation draft above, held in the client, restored after a
restart. Changing one of them changes only the draft; nothing about it is held
on the server connection. The first send (a prompt or a skill)
carries the draft's settings, the server checks each one (knowledge domain,
mode, export marker, folder exists;
the assembly checks role, soul, instruction and model; under Native Pi the
Alt selectors are recorded but inactive) and creates the conversation from
exactly that state in one step; a refused creation leaves nothing behind and
the text goes back to the draft. While the first send is
creating the conversation, a second send waits; text typed meanwhile moves
into the new conversation's draft. The server still resolves the model chip's
thinking level for the draft's model (`describe_draft`).

Once the draft has become a conversation its settings start over, except the
folder, which carries to the next new conversation; the permission starts from
the Settings default again. **New** pressed in a conversation lets the draft take that
conversation's knowledge, role, soul and instruction for this run of the app
(not kept on the device), under the choices the user already made in the
draft. Changing Settings > General > "New conversations start with" also sets
the draft's permission.

Actions that require an existing parent conversation, such as branching and
side conversations, are not shown as active draft actions. Help uses an ordinary
new-conversation draft. Draft-only
affordances must not clear input or close a menu while doing nothing.

The current **General knowledge work** starter is deliberately a temporary
parameter combination: Alt Theory runtime, Work mode, no role, and knowledge
off. Users may edit those selectors before sending. If broader knowledge work
later gains its own role or stronger semantics, replace this local preset with
a focused refactor rather than growing conditionals around the temporary label.

## Agent-assisted setup boundary

The help skill is part of the configuration architecture, not merely documentation.
It can help a user understand what they are connecting, inspect relevant
configuration and failure context, propose a change, apply it with normal user
approval, and verify that the provider/model can actually run.

The help skill may receive the relevant configuration and failure context. Protocol
details do not become default user-facing explanations. If no model is
available to run it, the deterministic OAuth/recommended-provider
bootstrap remains the fallback.

After the public GitHub help documentation exists, the same setup Markdown
provides a copyable prompt that points another AI to those docs. It contains
two clearly separated routes without becoming two pages:

- an on-device agent can inspect and help edit the local configuration;
- an online chatbot with web access can read the public docs and guide the
  user through the same setup without local machine access.

This external-agent route raises first-run accessibility before Alt itself can
run; it complements rather than replaces the shortest built-in bootstrap.

## Review and change rule

Before implementing a UI change, review the affected journey from the target
user's perspective and check:

- Is this the correct surface for the object or action?
- Does the intended user understand and control what is shown?
- Is common information being repeated while the primary action is buried?
- Can existing product or help capability handle the complexity instead?
- Does the change preserve visible draft/live state across navigation?

Exact labels and layouts may evolve through prototype review and product discussion.
The surface ownership and boundaries above remain authoritative until this
document is explicitly revised.
