export type Rigidity = "extreme" | "high" | "medium" | "soft" | "flexible" | "unknown";

export type AllowedMotion =
  | "camera_only"
  | "product_static"
  | "subtle_product_motion"
  | "controlled_showcase_motion"
  | "fabric_motion"
  | "liquid_motion"
  | "unknown";

export type ShowcaseMotionIntensity = "none" | "low" | "medium";

export type ShowcaseMotionAxis =
  | "x_axis"
  | "y_axis"
  | "z_axis"
  | "slight_tilt"
  | "vertical_lift"
  | "horizontal_slide"
  | "unknown";

export interface ShowcaseMotion {
  enabled: boolean;
  type: string;
  intensity: ShowcaseMotionIntensity;
  allowedAxes: ShowcaseMotionAxis[];
}

export interface PhysicsProfile {
  rigidity: Rigidity;
  allowedMotion: AllowedMotion;
  showcaseMotion: ShowcaseMotion;
  deformationAllowed: boolean;
}
