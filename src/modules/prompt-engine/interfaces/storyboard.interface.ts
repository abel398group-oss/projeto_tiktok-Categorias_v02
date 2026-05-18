export type StoryboardSceneCamera = "slow_push_in" | "macro_parallax" | "slow_orbit_or_push" | "unknown";

export interface StoryboardScene {
  name: string;
  duration: string;
  camera: StoryboardSceneCamera;
  description: string;
}

export interface Storyboard {
  scenes: StoryboardScene[];
}

