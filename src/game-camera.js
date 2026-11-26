export const GAME_CAMERA_EVENT = 'lfg:game-camera';

export function requestGameCamera() {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
}

export function hasLiveVideo(stream) {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live'));
}

export function stopGameCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}
