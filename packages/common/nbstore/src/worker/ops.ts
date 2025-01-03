import type {
  BlobRecord,
  DocClock,
  DocClocks,
  DocDiff,
  DocRecord,
  DocUpdate,
  ListedBlobRecord,
  StorageOptions,
} from '../storage';
import type { AwarenessRecord } from '../storage/awareness';
import type { DocSyncDocState, DocSyncState } from '../sync/doc';

interface GroupedWorkerOps {
  worker: {
    init: [
      {
        local: { name: string; opts: StorageOptions }[];
        remotes: { name: string; opts: StorageOptions }[][];
      },
      void,
    ];
    destroy: [void, void];
  };

  docStorage: {
    getDoc: [string, DocRecord | null];
    getDocDiff: [{ docId: string; state?: Uint8Array }, DocDiff | null];
    pushDocUpdate: [{ update: DocUpdate; origin?: string }, DocClock];
    getDocTimestamps: [Date | null, DocClocks];
    getDocTimestamp: [string, DocClock | null];
    deleteDoc: [string, void];
    subscribeDocUpdate: [void, { update: DocRecord; origin?: string }];
    waitForConnected: [void, boolean];
  };

  blobStorage: {
    getBlob: [string, BlobRecord | null];
    setBlob: [BlobRecord, void];
    deleteBlob: [{ key: string; permanently: boolean }, void];
    releaseBlobs: [void, void];
    listBlobs: [void, ListedBlobRecord[]];
  };

  syncStorage: {
    getPeerPulledRemoteClocks: [{ peer: string }, DocClocks];
    getPeerPulledRemoteClock: [
      { peer: string; docId: string },
      DocClock | null,
    ];
    setPeerPulledRemoteClock: [{ peer: string; clock: DocClock }, void];
    getPeerRemoteClocks: [{ peer: string }, DocClocks];
    getPeerRemoteClock: [{ peer: string; docId: string }, DocClock | null];
    setPeerRemoteClock: [{ peer: string; clock: DocClock }, void];
    getPeerPushedClocks: [{ peer: string }, DocClocks];
    getPeerPushedClock: [{ peer: string; docId: string }, DocClock | null];
    setPeerPushedClock: [{ peer: string; clock: DocClock }, void];
    clearClocks: [void, void];
  };

  awarenessStorage: {
    update: [{ awareness: AwarenessRecord; origin?: string }, void];
    subscribeUpdate: [
      string,
      (
        | {
            type: 'awareness-update';
            awareness: AwarenessRecord;
            origin?: string;
          }
        | { type: 'awareness-collect'; collectId: string }
      ),
    ];
    collect: [{ collectId: string; awareness: AwarenessRecord }, void];
  };

  docSync: {
    state: [void, DocSyncState];
    docState: [string, DocSyncDocState];
    addPriority: [{ docId: string; priority: number }, boolean];
  };

  blobSync: {
    downloadBlob: [string, BlobRecord | null];
    uploadBlob: [BlobRecord, void];
  };

  awarenessSync: {
    update: [{ awareness: AwarenessRecord; origin?: string }, void];
    subscribeUpdate: [
      string,
      (
        | {
            type: 'awareness-update';
            awareness: AwarenessRecord;
            origin?: string;
          }
        | { type: 'awareness-collect'; collectId: string }
      ),
    ];
    collect: [{ collectId: string; awareness: AwarenessRecord }, void];
  };
}

type Values<T> = T extends { [k in keyof T]: any } ? T[keyof T] : never;
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

export type WorkerOps = UnionToIntersection<
  Values<
    Values<{
      [k in keyof GroupedWorkerOps]: {
        [k2 in keyof GroupedWorkerOps[k]]: k2 extends string
          ? Record<`${k}.${k2}`, GroupedWorkerOps[k][k2]>
          : never;
      };
    }>
  >
>;
