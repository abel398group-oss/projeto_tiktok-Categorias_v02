import type { AiCommercial } from "../../ai-commercial/interfaces/ai-commercial.interface";
import type { Storyboard } from "../interfaces/storyboard.interface";

export function buildStoryboard(aiCommercial: AiCommercial): Storyboard {
  if (aiCommercial.visualCategory === "industrial_tools" && aiCommercial.subcategory === "drill_bits") {
    return {
      scenes: [
        {
          name: "Hero Shot",
          duration: "3-5s",
          camera: "slow_push_in",
          description:
            "Premium cinematic hero shot of the drill bit set on a dark premium industrial studio surface, emphasizing black metallic finish and rigid machined geometry."
        },
        {
          name: "Macro Detail",
          duration: "3-5s",
          camera: "macro_parallax",
          description:
            "Extreme macro shot highlighting sharp carbide cross tips, spiral flute design, hex shank structure, machined metal reflections, and titanium-like coating."
        },
        {
          name: "Final Showcase",
          duration: "3-5s",
          camera: "slow_orbit_or_push",
          description:
            "Clean final showcase of the complete 7-piece drill bit set, perfectly aligned, static, rigid, and grounded, with cold metallic lighting and premium industrial reflections."
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
          "Premium cinematic hero shot of the product on a clean studio surface, with controlled reflections and realistic shadows."
      },
      {
        name: "Macro Detail",
        duration: "3-5s",
        camera: "macro_parallax",
        description:
          "Macro detail shot highlighting the most important product materials, surface finish, geometry, and premium visual characteristics."
      },
      {
        name: "Final Showcase",
        duration: "3-5s",
        camera: "slow_orbit_or_push",
        description:
          "Final clean product showcase with stable framing, premium lighting, and strong commercial composition."
      }
    ]
  };
}

