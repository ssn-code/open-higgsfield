import type { GenerationPlane, ModelEntry } from "./catalog/types";
import type { StoredCredentials } from "./credentials";
import type { GenerationStatus, QueuedGeneration } from "./platform";

export type NimJob = {
  requestId: string;
  status: "queued" | "running" | "completed" | "failed";
  images?: Array<{ url: string }>;
  video?: { url: string };
  error?: string;
  createdAt: number;
};

// Global in-memory job store for NIM async tasks
const globalForNim = globalThis as unknown as { __nvidia_jobs?: Map<string, NimJob> };
export const nimJobs = globalForNim.__nvidia_jobs ?? new Map<string, NimJob>();
if (process.env.NODE_ENV !== "production") {
  globalForNim.__nvidia_jobs = nimJobs;
}

// Clean up stale jobs every 10 minutes
function cleanOldJobs() {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of nimJobs.entries()) {
    if (job.createdAt < cutoff) {
      nimJobs.delete(id);
    }
  }
}

export function isNimRequest(requestId: string): boolean {
  return requestId.startsWith("nim_");
}

export function getNimJobStatus(requestId: string): GenerationStatus {
  cleanOldJobs();
  const job = nimJobs.get(requestId);
  if (!job) {
    return {
      requestId,
      status: "failed",
      error: "Generation job not found or expired.",
    };
  }

  if (job.status === "completed") {
    return {
      requestId,
      status: "completed",
      images: job.images,
      video: job.video,
    };
  }

  if (job.status === "failed") {
    return {
      requestId,
      status: "failed",
      error: job.error ?? "NVIDIA NIM generation failed",
    };
  }

  return {
    requestId,
    status: "running",
  };
}

export function mapAspectRatioToSize(aspectRatio: unknown): string {
  switch (aspectRatio) {
    case "16:9":
      return "1280x720";
    case "9:16":
      return "720x1280";
    case "4:3":
      return "1024x768";
    case "3:4":
      return "768x1024";
    case "1:1":
    default:
      return "1024x1024";
  }
}

export async function submitNvidiaGeneration(
  credentials: StoredCredentials,
  plane: GenerationPlane,
  model: ModelEntry,
): Promise<QueuedGeneration> {
  const requestId = `nim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const baseUrl = (
    credentials.baseUrl ||
    process.env.NVIDIA_API_BASE_URL ||
    ""
  ).replace(/\/$/, "");

  const initialJob: NimJob = {
    requestId,
    status: "running",
    createdAt: Date.now(),
  };
  nimJobs.set(requestId, initialJob);

  // Run the inference in background so the UI immediately enters its queued/progress state
  void runNimInference(requestId, credentials.apiKey, baseUrl, plane, model);

  return {
    requestId,
    status: "queued",
    statusUrl: "",
    cancelUrl: "",
  };
}

async function runNimInference(
  requestId: string,
  apiKey: string,
  baseUrl: string,
  plane: GenerationPlane,
  model: ModelEntry,
) {
  try {
    const rawNimModel =
      (typeof plane.settings.customModel === "string" && plane.settings.customModel.trim()) ||
      model.nimModel ||
      model.id.replace(/^nvidia[-_]/, "");

    const isVideo = model.surface === "video";

    if (isVideo) {
      await runNimVideo(requestId, apiKey, baseUrl, rawNimModel, plane);
    } else {
      await runNimImage(requestId, apiKey, baseUrl, rawNimModel, plane);
    }
  } catch (error) {
    console.error("[NVIDIA NIM Error]", error);
    const job = nimJobs.get(requestId);
    if (job) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    }
  }
}

function parseImagesFromBody(body: unknown): Array<{ url: string }> {
  const images: Array<{ url: string }> = [];
  if (!body || typeof body !== "object") return images;

  const record = body as Record<string, unknown>;

  // NVIDIA Hosted GenAI response: { artifacts: [ { base64: "..." } ] }
  if (Array.isArray(record.artifacts)) {
    for (const item of record.artifacts) {
      if (typeof item === "object" && item !== null) {
        const art = item as Record<string, unknown>;
        if (typeof art.base64 === "string" && art.base64) {
          images.push({ url: `data:image/jpeg;base64,${art.base64}` });
        } else if (typeof art.url === "string" && art.url) {
          images.push({ url: art.url });
        }
      }
    }
  }

  // OpenAI standard: { data: [ { b64_json: "..." } | { url: "..." } ] }
  if (Array.isArray(record.data)) {
    for (const item of record.data) {
      if (typeof item === "object" && item !== null) {
        const d = item as Record<string, unknown>;
        if (typeof d.url === "string" && d.url) {
          images.push({ url: d.url });
        } else if (typeof d.b64_json === "string" && d.b64_json) {
          images.push({ url: `data:image/png;base64,${d.b64_json}` });
        }
      }
    }
  }

  // Raw base64 or image field
  if (typeof record.b64_json === "string" && record.b64_json) {
    images.push({ url: `data:image/png;base64,${record.b64_json}` });
  } else if (typeof record.image === "string" && record.image) {
    images.push({
      url: record.image.startsWith("data:")
        ? record.image
        : `data:image/png;base64,${record.image}`,
    });
  }

  return images;
}

async function runNimImage(
  requestId: string,
  apiKey: string,
  baseUrl: string,
  nimModel: string,
  plane: GenerationPlane,
) {
  const prompt = plane.prompt.text;
  const aspectRatio = typeof plane.settings.aspectRatio === "string" ? plane.settings.aspectRatio : "1:1";
  const size = mapAspectRatioToSize(aspectRatio);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Determine endpoints to try in order
  const isHostedNvidia =
    !baseUrl ||
    baseUrl.includes("api.nvidia.com") ||
    baseUrl.includes("integrate.api.nvidia.com");

  const endpointsToTry: Array<{ url: string; payload: Record<string, unknown> }> = [];

  if (isHostedNvidia) {
    // 1. Primary NVIDIA GenAI Cloud API: https://ai.api.nvidia.com/v1/genai/{model}
    const genaiUrl = `https://ai.api.nvidia.com/v1/genai/${nimModel}`;

    // Payload varies slightly by model type
    if (nimModel.includes("flux")) {
      endpointsToTry.push({
        url: genaiUrl,
        payload: {
          prompt,
          mode: "base",
          seed: 0,
        },
      });
    } else {
      endpointsToTry.push({
        url: genaiUrl,
        payload: {
          prompt,
          aspect_ratio: aspectRatio,
          seed: 0,
        },
      });
    }

    // 2. Fallback to OpenAI-style /images/generations on integrate.api.nvidia.com
    endpointsToTry.push({
      url: "https://integrate.api.nvidia.com/v1/images/generations",
      payload: {
        model: nimModel,
        prompt,
        size,
        response_format: "b64_json",
      },
    });
  } else {
    // Custom / self-hosted NIM endpoints
    endpointsToTry.push(
      {
        url: `${baseUrl}/infer`,
        payload: {
          model: nimModel,
          prompt,
          aspect_ratio: aspectRatio,
        },
      },
      {
        url: `${baseUrl}/v1/infer`,
        payload: {
          model: nimModel,
          prompt,
          aspect_ratio: aspectRatio,
        },
      },
      {
        url: `${baseUrl}/images/generations`,
        payload: {
          model: nimModel,
          prompt,
          size,
          response_format: "b64_json",
        },
      },
      {
        url: `${baseUrl}/v1/images/generations`,
        payload: {
          model: nimModel,
          prompt,
          size,
          response_format: "b64_json",
        },
      },
    );
  }

  let lastError = "Unable to connect to NVIDIA NIM endpoint.";

  for (const { url, payload } of endpointsToTry) {
    try {
      console.info("[NVIDIA NIM Image Attempt]", { url, model: nimModel });
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        lastError = extractErrorMessage(response.status, body);
        console.warn(`[NVIDIA NIM Image HTTP ${response.status}]`, { url, lastError });
        continue;
      }

      const images = parseImagesFromBody(body);
      if (images.length > 0) {
        const job = nimJobs.get(requestId);
        if (job) {
          job.status = "completed";
          job.images = images;
        }
        return;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn("[NVIDIA NIM Attempt Error]", { url, error: lastError });
    }
  }

  throw new Error(lastError);
}

async function runNimVideo(
  requestId: string,
  apiKey: string,
  baseUrl: string,
  nimModel: string,
  plane: GenerationPlane,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const startMedia = plane.media.start?.[0]?.url;
  const payload: Record<string, unknown> = {
    model: nimModel,
    model_mode: startMedia ? "image2video" : "text2video",
    prompt: plane.prompt.text,
    video_params: {
      width: 1280,
      height: 704,
      frames_count: 121,
      frames_per_sec: 24,
    },
  };
  if (startMedia) {
    payload.input_reference = startMedia;
    payload.image = startMedia;
  }

  const isHostedNvidia =
    !baseUrl ||
    baseUrl.includes("api.nvidia.com") ||
    baseUrl.includes("integrate.api.nvidia.com");

  const endpointsToTry = isHostedNvidia
    ? [
        `https://ai.api.nvidia.com/v1/genai/${nimModel}`,
        `https://ai.api.nvidia.com/v1/infer`,
      ]
    : [
        `${baseUrl}/infer`,
        `${baseUrl}/v1/infer`,
      ];

  let lastError = "Unable to connect to NVIDIA NIM video endpoint.";

  for (const url of endpointsToTry) {
    try {
      console.info("[NVIDIA NIM Video Attempt]", { url, model: nimModel });
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        lastError = extractErrorMessage(response.status, body);
        console.warn(`[NVIDIA NIM Video HTTP ${response.status}]`, { url, lastError });
        continue;
      }

      // Check if immediate video data is returned
      let videoUrl: string | undefined;
      if (body && typeof body === "object") {
        const rec = body as Record<string, unknown>;
        if (typeof rec.b64_video === "string" && rec.b64_video) {
          videoUrl = `data:video/mp4;base64,${rec.b64_video}`;
        } else if (typeof rec.video_url === "string" && rec.video_url) {
          videoUrl = rec.video_url;
        } else if (typeof rec.url === "string" && rec.url) {
          videoUrl = rec.url;
        } else if (Array.isArray(rec.artifacts) && rec.artifacts.length > 0) {
          const art = rec.artifacts[0] as Record<string, unknown>;
          if (typeof art.base64 === "string") {
            videoUrl = `data:video/mp4;base64,${art.base64}`;
          }
        }
      }

      if (videoUrl) {
        const job = nimJobs.get(requestId);
        if (job) {
          job.status = "completed";
          job.video = { url: videoUrl };
        }
        return;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn("[NVIDIA NIM Video Error]", { url, error: lastError });
    }
  }

  throw new Error(lastError);
}

function extractErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    if (typeof rec.detail === "string") return rec.detail;
    if (typeof rec.message === "string") return rec.message;
    if (rec.error && typeof rec.error === "object") {
      const err = rec.error as Record<string, unknown>;
      if (typeof err.message === "string") return err.message;
    }
  }
  return `NVIDIA NIM responded with HTTP status ${status}`;
}
