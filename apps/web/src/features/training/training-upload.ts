import { apiBaseUrl, clearApiRequestCache } from '../../lib/api';
export function uploadTrainingVideo(
  attemptId: string,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    xhr.open('POST', `${apiBaseUrl}/training/attempts/${encodeURIComponent(attemptId)}/video`);
    xhr.withCredentials = true;
    xhr.timeout = 360000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.upload.onload = () => onProgress(100);
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        clearApiRequestCache();
        resolve();
        return;
      }
      let message = '上传失败，请重试';
      try {
        message = JSON.parse(xhr.responseText).message || message;
      } catch {
        /* Proxy failures may return HTML. */
      }
      reject(new Error(`${message}（${xhr.status}）`));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error('上传连接中断，请检查网络后重试。'));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new Error('上传或视频处理超时，请刷新记录确认是否已保存，再重试。'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new Error('上传已取消；若文件已传完，请刷新记录确认处理结果后再重试。'));
    };
    if (signal?.aborted) {
      reject(new Error('上传已取消'));
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
