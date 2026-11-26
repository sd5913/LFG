import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { GAME_CAMERA_EVENT, hasLiveVideo, requestGameCamera, stopGameCamera } from './game-camera.js';

export const GameCamera = createContext(null);

export function useGameCamera() {
  return useContext(GameCamera);
}

export function useCameraSession() {
  const streamRef = useRef(null);
  const requestRef = useRef(null);
  const [camera, setCamera] = useState({ stream: null, status: 'idle' });
  const disable = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stopGameCamera(stream);
    setCamera({ stream: null, status: 'idle' });
  }, []);

  const toggle = useCallback(async () => {
    if (requestRef.current) return;
    if (streamRef.current) {
      disable();
      return;
    }

    const request = {};
    requestRef.current = request;
    setCamera({ stream: null, status: 'requesting' });
    try {
      const stream = await requestGameCamera();
      if (requestRef.current !== request || !hasLiveVideo(stream)) {
        stopGameCamera(stream);
        if (requestRef.current === request) setCamera({ stream: null, status: 'error' });
        return;
      }
      streamRef.current = stream;
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (streamRef.current === stream && !hasLiveVideo(stream)) disable();
        }, { once: true });
      }
      setCamera({ stream, status: 'ready' });
    } catch {
      if (requestRef.current === request) setCamera({ stream: null, status: 'error' });
    } finally {
      if (requestRef.current === request) requestRef.current = null;
    }
  }, [disable]);

  useEffect(() => () => {
    requestRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    stopGameCamera(stream);
  }, []);

  return { ...camera, toggle };
}

export function useFrameCamera(ref, frameVisible = true) {
  const { stream } = useGameCamera();
  const sync = useCallback(() => {
    const frame = ref.current;
    if (frame?.contentDocument) {
      // Same-origin frames receive the stream by reference without requesting camera access.
      frame.contentWindow.dispatchEvent(new CustomEvent(GAME_CAMERA_EVENT, { detail: stream }));
    }
  }, [ref, stream]);
  useEffect(() => {
    if (frameVisible) sync();
  }, [frameVisible, sync]);
  return sync;
}
