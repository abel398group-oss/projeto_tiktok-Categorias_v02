export type Rigidity = "extreme" | "high" | "medium" | "soft" | "flexible" | "unknown";

export type AllowedMotion =
  | "camera_only"
  | "product_static"
  | "subtle_product_motion"
  | "fabric_motion"
  | "liquid_motion"
  | "unknown";

export interface PhysicsProfile {
  rigidity: Rigidity;
  allowedMotion: AllowedMotion;
  deformationAllowed: boolean;
}
