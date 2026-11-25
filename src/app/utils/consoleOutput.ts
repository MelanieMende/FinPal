import type { Writable } from 'node:stream';

/** A detached terminal must not terminate the Electron main process. */
export function guardConsoleOutput(streams: Array<Pick<Writable, 'on'>>): void {
  for (const stream of streams) stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') throw error;
  });
}
