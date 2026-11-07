import type { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';

/**
 * All-or-nothing finish for a parallel multi-file upload. `settled` is the
 * Promise.allSettled result; when any file failed, the storage objects and DB
 * rows that did land are removed (best effort) and the first error is thrown,
 * so "request failed" really means "nothing saved" and a retry can't duplicate.
 * Returns the fulfilled values otherwise.
 */
export async function finishBatch<T>(
  settled: PromiseSettledResult<T>[],
  stored: { storagePath: string; thumbPath: string | null }[],
  deleteRows: () => Promise<unknown>,
  storage: Pick<SupabaseStorageService, 'deleteFile'>,
): Promise<T[]> {
  const failed = settled.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );
  if (failed) {
    await deleteRows().catch(() => undefined);
    await Promise.all(
      stored.map((s) =>
        storage.deleteFile(s.storagePath, s.thumbPath).catch(() => undefined),
      ),
    );
    throw failed.reason;
  }
  return settled.map((r) => (r as PromiseFulfilledResult<T>).value);
}
