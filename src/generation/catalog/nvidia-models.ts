import type { ModelEntry } from "./types";

const IMAGE_ASPECT = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
const VIDEO_ASPECT = ["16:9", "9:16", "1:1"] as const;

export function nvidiaImageModel(id: string, label: string, nimModel: string): ModelEntry {
  return {
    id,
    surface: "image",
    label,
    provider: "nvidia",
    nimModel,
    roles: { reference: 1 },
    settings: {
      aspectRatio: { type: "enum", values: IMAGE_ASPECT, default: "1:1" },
      resolution: { type: "enum", values: ["1k", "2k"], default: "1k" },
    },
  };
}

export function nvidiaVideoModel(id: string, label: string, nimModel: string): ModelEntry {
  return {
    id,
    surface: "video",
    label,
    provider: "nvidia",
    nimModel,
    roles: { start: 1 },
    settings: {
      aspectRatio: { type: "enum", values: VIDEO_ASPECT, default: "16:9" },
      resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
      duration: { type: "range", min: 3, max: 10, default: 5 },
    },
  };
}

// Curated NVIDIA NIM Image models
export const nvidiaFluxDev = nvidiaImageModel(
  "nvidia-flux-1-dev",
  "NVIDIA NIM · FLUX.1 [dev]",
  "black-forest-labs/flux.1-dev",
);

export const nvidiaFluxSchnell = nvidiaImageModel(
  "nvidia-flux-1-schnell",
  "NVIDIA NIM · FLUX.1 [schnell]",
  "black-forest-labs/flux.1-schnell",
);

export const nvidiaSd35Large = nvidiaImageModel(
  "nvidia-sd-3-5-large",
  "NVIDIA NIM · SD 3.5 Large",
  "stabilityai/stable-diffusion-3.5-large",
);

export const nvidiaSd35Medium = nvidiaImageModel(
  "nvidia-sd-3-5-medium",
  "NVIDIA NIM · SD 3.5 Medium",
  "stabilityai/stable-diffusion-3.5-medium",
);

export const nvidiaSdxlTurbo = nvidiaImageModel(
  "nvidia-sdxl-turbo",
  "NVIDIA NIM · SDXL Turbo",
  "stabilityai/sdxl-turbo",
);

export const nvidiaCustomImage = nvidiaImageModel(
  "nvidia-custom-image",
  "NVIDIA NIM · Custom Image Model",
  "black-forest-labs/flux.1-dev",
);

// Curated NVIDIA NIM Video models
export const nvidiaCosmos3Nano = nvidiaVideoModel(
  "nvidia-cosmos-3-nano",
  "NVIDIA NIM · Cosmos 3 Nano",
  "nvidia/cosmos3-nano",
);

export const nvidiaCosmos7b = nvidiaVideoModel(
  "nvidia-cosmos-1-0-diffusion-7b",
  "NVIDIA NIM · Cosmos 7B Text2World",
  "nvidia/cosmos-1.0-diffusion-7b-text2world",
);

export const nvidiaCosmos14b = nvidiaVideoModel(
  "nvidia-cosmos-1-0-diffusion-14b",
  "NVIDIA NIM · Cosmos 14B Video2World",
  "nvidia/cosmos-1.0-diffusion-14b-video2world",
);

export const nvidiaCustomVideo = nvidiaVideoModel(
  "nvidia-custom-video",
  "NVIDIA NIM · Custom Video Model",
  "nvidia/cosmos3-nano",
);

export const NVIDIA_MODELS: readonly ModelEntry[] = [
  nvidiaFluxDev,
  nvidiaFluxSchnell,
  nvidiaSd35Large,
  nvidiaSd35Medium,
  nvidiaSdxlTurbo,
  nvidiaCustomImage,
  nvidiaCosmos3Nano,
  nvidiaCosmos7b,
  nvidiaCosmos14b,
  nvidiaCustomVideo,
];
