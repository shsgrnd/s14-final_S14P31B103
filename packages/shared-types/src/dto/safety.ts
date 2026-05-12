import { z } from 'zod';
import * as schemas from '../schemas/safety';

export type SessionMeta = z.infer<typeof schemas.SessionMetaSchema>;
export type SnapshotMeta = z.infer<typeof schemas.SnapshotMetaSchema>;
export type SnapshotHunk = z.infer<typeof schemas.SnapshotHunkSchema>;
export type SnapshotFile = z.infer<typeof schemas.SnapshotFileSchema>;
export type SnapshotManifest = z.infer<typeof schemas.SnapshotManifestSchema>;
export type SnapshotDetail = z.infer<typeof schemas.SnapshotDetailSchema>;
export type RestoreHistory = z.infer<typeof schemas.RestoreHistorySchema>;
export type SafetyWarning = z.infer<typeof schemas.SafetyWarningSchema>;
