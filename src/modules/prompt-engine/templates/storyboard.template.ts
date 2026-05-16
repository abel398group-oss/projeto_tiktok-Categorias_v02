import type { AiCommercial } from "../../ai-commercial/interfaces/ai-commercial.interface";
import type { Storyboard } from "../interfaces/storyboard.interface";

export function buildStoryboard(aiCommercial: AiCommercial): Storyboard {
  if (aiCommercial.visualCategory === "industrial_tools" && aiCommercial.subcategory === "sds_plus_chisel") {
    return {
      scenes: [
        {
          name: "Hero Shot",
          duration: "3-5s",
          camera: "slow_push_in",
          description:
            "Static hero shot of a museum-grade industrial design piece on a premium studio surface. The object stays perfectly still while the camera performs a slow orbit/push-in with physically plausible reflections and realistic shadows."
        },
        {
          name: "Geometry Fidelity Macro",
          duration: "3-5s",
          camera: "macro_parallax",
          description:
            "Macro parallax emphasizing the exact silhouette, SDS-plus shank profile, and chisel tip geometry. Preserve the real industrial structure—no spiral drill geometry, no helical flutes, no threaded surfaces, no hybrid tool forms. The object remains completely static."
        },
        {
          name: "Final Showcase",
          duration: "3-5s",
          camera: "slow_orbit_or_push",
          description:
            "Final static showcase with clean composition and controlled studio backdrop (not a generic dark void). Premium industrial lighting and subtle reflections, no implied operation, no mechanical interpretation, no attached devices."
        }
      ]
    };
  }

  if (aiCommercial.visualCategory === "industrial_tools" && aiCommercial.subcategory === "drill_bits") {
    return {
      scenes: [
        {
          name: "Hero Shot",
          duration: "3-5s",
          camera: "slow_push_in",
          description:
            "Static hero shot of a precision machined metallic object set on a dark premium industrial studio surface. The objects stay perfectly still while the camera performs a slow premium orbit/push-in around them, emphasizing rigid engineered geometry and controlled reflections."
        },
        {
          name: "Macro Detail",
          duration: "3-5s",
          camera: "macro_parallax",
          description:
            "Extreme macro camera parallax highlighting engineered metallic geometry, helical metallic grooves, crisp edges and facets, premium surface reflections, and high-end coating-like finish details. The objects remain completely static."
        },
        {
          name: "Final Showcase",
          duration: "3-5s",
          camera: "slow_orbit_or_push",
          description:
            "Final static showcase of the full arranged set of precision machined metallic objects, perfectly aligned and grounded. Use elegant camera choreography (slow orbit/dolly) and premium industrial lighting—no implied operation, no mechanical interpretation, no spinning, no attached devices."
        }
      ]
    };
  }

  return {
    scenes: [
      {
        name: "Hero Shot",
        duration: "3-5s",
        camera: "slow_push_in",
        description:
          "Static hero object on a clean premium studio surface. The product stays perfectly still while the camera performs a slow push-in/orbit with controlled reflections and realistic shadows."
      },
      {
        name: "Macro Detail",
        duration: "3-5s",
        camera: "macro_parallax",
        description:
          "Macro camera parallax highlighting the most important materials, surface finish, geometry, and premium visual characteristics. The object remains completely static."
      },
      {
        name: "Final Showcase",
        duration: "3-5s",
        camera: "slow_orbit_or_push",
        description:
          "Final clean showcase with elegant camera orbit/dolly movement, stable framing, premium lighting, and strong commercial composition around the stationary product."
      }
    ]
  };
}
