import type { GeometryProfile } from "./geometry-profile.interface";
import type { MotionRiskProfile } from "./motion-risk-profile.interface";
import type { ProductIdentity } from "./product-identity.interface";
import type { SemanticRiskProfile } from "./semantic-risk-profile.interface";

export interface ProductUnderstandingResult {
  productIdentity: ProductIdentity;
  geometryProfile: GeometryProfile;
  semanticRiskProfile: SemanticRiskProfile;
  motionRiskProfile: MotionRiskProfile;
}
