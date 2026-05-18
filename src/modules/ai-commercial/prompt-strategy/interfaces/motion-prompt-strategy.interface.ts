export interface MotionPromptStrategy {
  objectMotionInstruction: string;
  cameraMotionInstruction: string;
  allowedCameraMotions: string[];
  forbiddenObjectMotions: string[];
}
