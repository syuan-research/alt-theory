---
doc_type: feature-design
feature: 2026-06-17-workspace-upload-and-message-copy
status: approved
summary: Participant workspace upload, extraction, quota, Summary panel file UI, staging, and message copy.
swe_plan: research-console-v0-5
swe_plan_item: workspace-upload-and-message-copy
tags: [v0-5, workspace-files, upload, participant-view, message-copy]
---

# Workspace Upload And Message Copy Design

## 1. Scope

App backend uploads into session `workspace/uploads/`, extracts binary files into
`workspace/extracted/{stem}_converted_from_binary.*` using Node libraries by
default (optional pandoc/pdftotext via env for dev). Pi agent tools do not run
conversion; they read extracted text files only.

Frontend: Summary panel workspace file surface (reuse Records text editor
pattern), staging checkboxes, attachment line on send, message copy controls.

Non-goals: WebSocket heartbeat, deploy, binary download, OCR, pptx, agent-side CLI.

## 2. Backend Contracts

- `POST /api/sessions/:id/files/upload` multipart field `file`
- `POST /api/sessions/:id/files/retry-extract` JSON `{ path }` uploads-relative
- `GET /api/sessions/:id/files?root=workspace` adds `usage`, `entries[]` with
  `kind`, `stageable`, `downloadable`, `extractStatus`, `extractError`
- Delete/download remain workspace-only; download text-readable files only

Quotas: per-file type limits, session 50MB, account 500MB.

## 3. Frontend

Summary panel: file list + shared editor + small summary hint + usage line.
Row: checkbox (staging), click path opens editor, hover download/delete/retry.
Send appends `（见附件：...）` when staged paths exist.