/** @jest-environment node */
import { PassThrough } from 'node:stream';
import { guardConsoleOutput } from './consoleOutput';

it('tolerates a closed console pipe without hiding other output failures', () => {
  const stream = new PassThrough();
  guardConsoleOutput([stream]);
  expect(() => stream.emit('error', Object.assign(new Error('closed pipe'), { code: 'EPIPE' }))).not.toThrow();
  expect(() => stream.emit('error', Object.assign(new Error('other failure'), { code: 'EIO' }))).toThrow('other failure');
});
