/**
 * Optional camera adapter for the early-stage demo.
 * - Webcam and MediaPipe are NOT needed for the manual demo.
 * - Pose landmarks are estimated locally by the MediaPipe model at runtime.
 * - This is intentionally a simple prototype heuristic, not a calibrated pose classifier.
 * - It sends only the matched / not-matched result into guard logic.
 */
const MEDIAPIPE_VERSION = '1.2.0';
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const visible = point => point && (point.visibility === undefined || point.visibility >= 0.40);

export function evaluateUpperBodyPose(landmarks, target) {
  if (!landmarks) return { matched: false, recognized: false };
  const leftShoulder = landmarks[11], rightShoulder = landmarks[12];
  const leftElbow = landmarks[13], rightElbow = landmarks[14];
  const leftWrist = landmarks[15], rightWrist = landmarks[16];
  const joints = [leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist];
  if (!joints.every(visible)) return { matched: false, recognized: false };

  // Normalized to shoulder distance to accommodate a range of camera distances.
  const shoulderWidth = Math.max(0.11, Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y));
  const above = (wrist, shoulder) => (shoulder.y - wrist.y) / shoulderWidth > 0.32;
  const level = (wrist, shoulder) => Math.abs(wrist.y - shoulder.y) / shoulderWidth < 0.38;
  const outward = (wrist, shoulder) => Math.abs(wrist.x - shoulder.x) / shoulderWidth > 0.57;
  let matched = false;
  if (target === 'ARMS_UP') {
    matched = above(leftWrist, leftShoulder) && above(rightWrist, rightShoulder);
  } else if (target === 'T_POSE') {
    matched = level(leftWrist, leftShoulder) && level(rightWrist, rightShoulder)
      && outward(leftWrist, leftShoulder) && outward(rightWrist, rightShoulder)
      && level(leftElbow, leftShoulder) && level(rightElbow, rightShoulder);
  }
  return { matched, recognized: true };
}

export class WebcamPoseTracker {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.detector = null;
    this.active = false;
    this.status = 'Camera off';
    this.lastVideoTime = -1;
    this.latest = { matched: false, recognized: false };
    this.lastTimestamp = 0;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires localhost or HTTPS and a supported browser.');
    }
    this.status = 'Requesting camera permission…';
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: 640, height: 480, facingMode: 'user' } });
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
      this.status = 'Loading MediaPipe model (internet required)…';
      const { FilesetResolver, PoseLandmarker } = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`);
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      this.detector = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      this.active = true;
      this.status = 'Camera ready';
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  update(target, timestamp) {
    if (!this.active || !this.detector || this.video.readyState < 2) {
      return { matched: false, recognized: false };
    }
    // Limit expensive synchronous inference to about 8 FPS for the demo.
    if (timestamp - this.lastTimestamp < 120 || this.video.currentTime === this.lastVideoTime) {
      return this.latest;
    }
    this.lastTimestamp = timestamp;
    this.lastVideoTime = this.video.currentTime;
    try {
      const result = this.detector.detectForVideo(this.video, timestamp);
      this.latest = evaluateUpperBodyPose(result.landmarks?.[0], target);
      this.status = this.latest.recognized ? 'Upper body detected' : 'Move back: shoulders and wrists must be visible';
    } catch (error) {
      this.status = `Tracking error: ${error.message}`;
      this.latest = { matched: false, recognized: false };
    }
    return this.latest;
  }

  stop() {
    this.active = false;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.detector?.close?.();
    this.detector = null;
    this.latest = { matched: false, recognized: false };
    this.status = 'Camera off';
  }
}
