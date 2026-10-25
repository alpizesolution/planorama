# Planorama

**Your whole year, in view.**

Planorama is a personal planning app combining a colorful year/month/day calendar with flexible tasks and optional Google Calendar synchronization.

## Phase 1

- Establish the Next.js + React + TypeScript foundation.
- Preserve the ALpize apptracker visual language: Bricolage Grotesque headings, Lexend body text, cream surfaces, bold dark outlines, hard offset shadows, and bright accent colors.
- Keep apptracker read-only; this repository is independent.
- Build and validate on a feature branch before any production deployment.

## Features

- **Year, Month, Week & Day Views**: Colorful, neo-brutalist yearline, mini grids, weekly 7-day timeline, and Kanban status views.
- **Tasks, Projects, Labels & Habits**: Full task lifecycle with priorities, pinned items, personal categories, time/date preferences, and recurrence (daily, weekly, monthly, yearly).
- **Two-Way Google Calendar Synchronization**:
  - Secure, server-side OAuth 2.0 with AES-256-GCM encrypted token storage.
  - Multi-account connection for Virtual Assistants to manage both personal and authorized client calendars.
  - Granular calendar selection, custom color preservation, and default calendar assignment for new events.
  - Durable offline sync queue with automatic action coalescing and tombstone resurrection prevention.
  - Timestamp and ETag conflict resolution engine with retry exponential backoff.
- **Local-first guest mode** with optional Firebase synchronization and validated JSON backup/restore.

## Documentation

- [Google Calendar Integration & Virtual Assistant Setup Guide](docs/GOOGLE_CALENDAR_SETUP.md)

## Development

```bash
# Run tests
npm test

# Typecheck
npm run typecheck

# Lint
npm run lint

# Build production bundle
npm run build
```
