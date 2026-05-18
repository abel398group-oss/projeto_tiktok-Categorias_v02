export type ProductObjectType = "sds_plus_chisel" | "generic_product";

export type ProductVisualClass = "demolition_tool" | "consumer_product";

export type ProductRigidity = "fully_rigid" | "unknown";

export interface ProductIdentity {
  objectType: ProductObjectType;
  visualClass: ProductVisualClass;
  category: string;
  subcategory: string;
  materialFamily: string;
  surfaceFinish: string;
  rigidity: ProductRigidity;
  semanticAlias: string;
}
