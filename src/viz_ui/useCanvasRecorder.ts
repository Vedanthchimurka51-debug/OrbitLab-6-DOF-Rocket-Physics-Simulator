import { useCallback, useEffect, useRef, useState } from 'react';

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export function useCanvasRecorder(canvas: HTMLCanvasElement | null) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recorderError, setRecorderError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    clearTimer();
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
    setIsRecording(false);
  }, [clearTimer]);

  const startRecording = useCallback(() => {
    setRecorderError(null);
    if (!canvas) {
      setRecorderError('3D viewport canvas is not ready yet.');
      return;
    }
    if (
      typeof canvas.captureStream !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      setRecorderError(
        'In-browser video capture (MediaRecorder) is not supported in this browser.'
      );
      return;
    }

    try {
      const stream = canvas.captureStream(60);
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 6_000_000,
          })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        clearTimer();
        setIsRecording(false);
        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'video/webm',
        });
        chunksRef.current = [];

        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) {
            track.stop();
          }
          streamRef.current = null;
        }

        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const stamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-')
            .slice(0, 19);
          a.href = url;
          a.download = `orbitlab-6dof-demo-${stamp}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      };

      recorder.onerror = () => {
        clearTimer();
        setIsRecording(false);
        setRecorderError('Video recording failed while capturing WebGL frames.');
      };

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setRecordSeconds(0);
      setIsRecording(true);
      recorder.start(250);

      timerRef.current = window.setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch {
      clearTimer();
      setIsRecording(false);
      setRecorderError('Unable to initialize WebGL MediaRecorder stream.');
    }
  }, [canvas, clearTimer]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      clearTimer();
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.stop();
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, [clearTimer]);

  return {
    isRecording,
    recordSeconds,
    recorderError,
    clearRecorderError: () => setRecorderError(null),
    toggleRecording,
    stopRecording,
  };
}
