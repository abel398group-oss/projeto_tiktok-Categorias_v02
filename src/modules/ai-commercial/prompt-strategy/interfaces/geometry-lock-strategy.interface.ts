export interface GeometryLockStrategy {
  geometryInstruction: string;
  preservationRules: string[];
  forbiddenGeometryChanges: string[];
}
