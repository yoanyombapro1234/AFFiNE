import type { Socket, SocketOptions } from 'socket.io-client';

import {
  type Connection,
  type ConnectionStatus,
  share,
} from '../../connection';
import {
  type DocClock,
  type DocClocks,
  DocStorageBase,
  type DocStorageOptions,
  type DocUpdate,
} from '../../storage';
import {
  base64ToUint8Array,
  type ServerEventsMap,
  SocketConnection,
  uint8ArrayToBase64,
} from './socket';

interface CloudDocStorageOptions extends DocStorageOptions {
  socketOptions: SocketOptions;
  serverBaseUrl: string;
}

export class CloudDocStorage extends DocStorageBase<CloudDocStorageOptions> {
  get socket() {
    return this.connection.inner;
  }

  onServerUpdate: ServerEventsMap['space:broadcast-doc-update'] = message => {
    if (
      this.spaceType === message.spaceType &&
      this.spaceId === message.spaceId
    ) {
      this.emit('update', {
        docId: message.docId,
        bin: base64ToUint8Array(message.update),
        timestamp: new Date(message.timestamp),
        editor: message.editor,
      });
    }
  };

  readonly connection = new CloudDocStorageConnection(
    this.options,
    this.onServerUpdate
  );

  override async getDocSnapshot(docId: string) {
    const response = await this.socket.emitWithAck('space:load-doc', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId,
    });

    if ('error' in response) {
      // TODO: use [UserFriendlyError]
      throw new Error(response.error.message);
    }

    return {
      docId,
      bin: base64ToUint8Array(response.data.missing),
      timestamp: new Date(response.data.timestamp),
    };
  }

  override async getDocDiff(docId: string, state?: Uint8Array) {
    const response = await this.socket.emitWithAck('space:load-doc', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId,
      stateVector: state ? await uint8ArrayToBase64(state) : void 0,
    });

    if ('error' in response) {
      // TODO: use [UserFriendlyError]
      throw new Error(response.error.message);
    }

    return {
      docId,
      missing: base64ToUint8Array(response.data.missing),
      state: base64ToUint8Array(response.data.state),
      timestamp: new Date(response.data.timestamp),
    };
  }

  override async pushDocUpdate(update: DocUpdate) {
    const response = await this.socket.emitWithAck('space:push-doc-update', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId: update.docId,
      updates: await uint8ArrayToBase64(update.bin),
    });

    if ('error' in response) {
      // TODO(@forehalo): use [UserFriendlyError]
      throw new Error(response.error.message);
    }

    return {
      docId: update.docId,
      timestamp: new Date(response.data.timestamp),
    };
  }

  /**
   * Just a rough implementation, cloud doc storage should not need this method.
   */
  override async getDocTimestamp(docId: string): Promise<DocClock | null> {
    const response = await this.socket.emitWithAck('space:load-doc', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId,
    });

    if ('error' in response) {
      // TODO: use [UserFriendlyError]
      throw new Error(response.error.message);
    }

    return {
      docId,
      timestamp: new Date(response.data.timestamp),
    };
  }

  override async getDocTimestamps(after?: Date) {
    const response = await this.socket.emitWithAck(
      'space:load-doc-timestamps',
      {
        spaceType: this.spaceType,
        spaceId: this.spaceId,
        timestamp: after ? after.getTime() : undefined,
      }
    );

    if ('error' in response) {
      // TODO(@forehalo): use [UserFriendlyError]
      throw new Error(response.error.message);
    }

    return Object.entries(response.data).reduce((ret, [docId, timestamp]) => {
      ret[docId] = new Date(timestamp);
      return ret;
    }, {} as DocClocks);
  }

  override async deleteDoc(docId: string) {
    this.socket.emit('space:delete-doc', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId,
    });
  }

  protected async setDocSnapshot() {
    return false;
  }
  protected async getDocUpdates() {
    return [];
  }
  protected async markUpdatesMerged() {
    return 0;
  }
}

class CloudDocStorageConnection implements Connection<Socket> {
  connection = share(
    new SocketConnection(
      `${this.options.serverBaseUrl}/`,
      this.options.socketOptions
    )
  );

  private disposeConnectionStatusListener?: () => void;

  private get socket() {
    return this.connection.inner;
  }

  constructor(
    private readonly options: CloudDocStorageOptions,
    private readonly onServerUpdate: ServerEventsMap['space:broadcast-doc-update']
  ) {}

  get status() {
    return this.connection.status;
  }

  get inner() {
    return this.connection.inner;
  }

  connect(): void {
    if (!this.disposeConnectionStatusListener) {
      this.disposeConnectionStatusListener = this.connection.onStatusChanged(
        status => {
          if (status === 'connected') {
            this.join().catch(err => {
              console.error('doc storage join failed', err);
            });
            this.socket.on('space:broadcast-doc-update', this.onServerUpdate);
          }
        }
      );
    }
    return this.connection.connect();
  }

  async join() {
    try {
      const res = await this.socket.emitWithAck('space:join', {
        spaceType: this.options.type,
        spaceId: this.options.id,
        clientVersion: BUILD_CONFIG.appVersion,
      });

      if ('error' in res) {
        this.connection.setStatus('closed', new Error(res.error.message));
      }
    } catch (e) {
      this.connection.setStatus('error', e as Error);
    }
  }

  disconnect() {
    if (this.disposeConnectionStatusListener) {
      this.disposeConnectionStatusListener();
    }
    this.socket.emit('space:leave', {
      spaceType: this.options.type,
      spaceId: this.options.id,
    });
    this.socket.off('space:broadcast-doc-update', this.onServerUpdate);
    this.connection.disconnect();
  }

  waitForConnected(signal?: AbortSignal): Promise<void> {
    return this.connection.waitForConnected(signal);
  }
  onStatusChanged(
    cb: (status: ConnectionStatus, error?: Error) => void
  ): () => void {
    return this.connection.onStatusChanged(cb);
  }
}
