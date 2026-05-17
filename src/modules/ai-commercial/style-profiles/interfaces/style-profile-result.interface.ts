import type { StyleProfile } from "./style-profile.interface";

export interface StyleProfileResult {
  selectedProfile: StyleProfile;
  reason: string;
  warnings: string[];
}
