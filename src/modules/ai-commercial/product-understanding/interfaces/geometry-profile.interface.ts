export type GeometrySymmetry = "axial" | "unknown";

export interface GeometryProfile {
  geometryFamily: string;
  shapeDescription: string;
  primaryAxis: string;
  symmetry: GeometrySymmetry;
  mustRemainRigid: boolean;
  mustRemainStraight: boolean;
  mustNotMorph: boolean;
  mustNotTwist: boolean;
  mustNotSpiralize: boolean;
  mustNotSegment: boolean;
}
