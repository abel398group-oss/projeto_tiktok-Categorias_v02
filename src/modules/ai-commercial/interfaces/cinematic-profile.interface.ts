export type CinematicStyle =
  | "luxury_industrial_macro"
  | "luxury_beauty_soft_reflections"
  | "premium_tech_showcase"
  | "editorial_fashion_motion"
  | "product_showcase"
  | "ugc"
  | "studio"
  | "lifestyle"
  | "industrial"
  | "unknown";

export type CameraStyle =
  | "slow_push_in"
  | "static"
  | "handheld"
  | "gimbal"
  | "macro"
  | "mixed"
  | "unknown";

export type LightingStyle =
  | "dark_premium_studio"
  | "warm_soft_premium_studio"
  | "dark_futuristic_reflections"
  | "soft_editorial_studio"
  | "soft"
  | "hard"
  | "natural"
  | "studio"
  | "mixed"
  | "unknown";

export interface CinematicProfile {
  style: CinematicStyle;
  camera: CameraStyle;
  lighting: LightingStyle;
}
