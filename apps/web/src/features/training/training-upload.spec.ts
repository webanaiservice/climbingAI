import { afterEach, expect, it, vi } from 'vitest';
import { uploadTrainingVideo } from './training-upload';
function setup() {
  const xhr = {
    open: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    upload: {} as { onprogress: (v: unknown) => void; onload: () => void },
    onload: () => {},
    onerror: () => {},
    onabort: () => {},
    ontimeout: () => {},
    status: 201,
    responseText: '{}',
    withCredentials: false,
    timeout: 0,
  };
  vi.stubGlobal(
    'XMLHttpRequest',
    vi.fn(function () {
      return xhr;
    }),
  );
  return xhr;
}
afterEach(() => vi.unstubAllGlobals());
it('reports transfer progress and waits for server processing before success', async () => {
  const xhr = setup();
  const progress = vi.fn();
  const complete = vi.fn();
  const task = uploadTrainingVideo('attempt', new File(['test'], 'test.mov'), progress).then(
    complete,
  );
  xhr.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
  expect(progress).toHaveBeenLastCalledWith(50);
  xhr.upload.onload();
  expect(progress).toHaveBeenLastCalledWith(100);
  expect(complete).not.toHaveBeenCalled();
  xhr.onload();
  await task;
  expect(complete).toHaveBeenCalled();
  expect(xhr.withCredentials).toBe(true);
  expect(xhr.timeout).toBe(360000);
});
it('reports actionable proxy failures and allows cancellation', async () => {
  let xhr = setup();
  const failed = uploadTrainingVideo('a', new File(['x'], 'test.mov'), vi.fn());
  xhr.status = 413;
  xhr.responseText = '<html>too big</html>';
  xhr.onload();
  await expect(failed).rejects.toThrow('413');
  xhr = setup();
  const controller = new AbortController();
  const canceled = uploadTrainingVideo(
    'a',
    new File(['x'], 'test.mov'),
    vi.fn(),
    controller.signal,
  );
  controller.abort();
  expect(xhr.abort).toHaveBeenCalled();
  xhr.onabort();
  await expect(canceled).rejects.toThrow('已取消');
});
