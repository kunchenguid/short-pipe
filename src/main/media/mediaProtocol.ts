import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import type {
  CaptionStyle,
  LayoutKind,
  Project,
  Theme,
  TitleStyle,
  Transcript,
  VideoFit,
} from "@shared/project";
import { CAPTION_STYLES, LAYOUT_KINDS, THEMES, TITLE_STYLES, VIDEO_FITS } from "@shared/project";
import { protocol } from "electron";
import { assertSafeId } from "../storage/layout";
import { buildPreviewDocument, parseByteRange } from "./composition";

/** Custom local scheme that serves project footage + live-preview documents. */
export const MEDIA_SCHEME = "sp-media";

/**
 * Privileged registration must run before `app.ready`. `stream` lets <video>
 * range-request the file; `secure`/`standard` give the scheme a real origin so
 * its preview document can run its own inline driver.
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
};

function nodeToWebStream(stream: Readable): ReadableStream {
  return Readable.toWeb(stream) as unknown as ReadableStream;
}

/** Stream a file, honouring an HTTP Range request so <video> can seek. */
async function serveFile(path: string, rangeHeader: string | null): Promise<Response> {
  const info = await stat(path);
  const size = info.size;
  const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
  const range = parseByteRange(rangeHeader, size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  if (range) {
    const { start, end } = range;
    return new Response(nodeToWebStream(createReadStream(path, { start, end })), {
      status: 206,
      headers: {
        "content-type": type,
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
        "content-length": String(end - start + 1),
      },
    });
  }
  return new Response(nodeToWebStream(createReadStream(path)), {
    status: 200,
    headers: { "content-type": type, "accept-ranges": "bytes", "content-length": String(size) },
  });
}

const isLayout = (v: string | null): v is LayoutKind =>
  !!v && LAYOUT_KINDS.includes(v as LayoutKind);
const isCaption = (v: string | null): v is CaptionStyle =>
  !!v && CAPTION_STYLES.includes(v as CaptionStyle);
const isTitleStyle = (v: string | null): v is TitleStyle =>
  !!v && TITLE_STYLES.includes(v as TitleStyle);
const isTheme = (v: string | null): v is Theme => !!v && THEMES.includes(v as Theme);
const isVideoFit = (v: string | null): v is VideoFit => !!v && VIDEO_FITS.includes(v as VideoFit);

function num(v: string | null, fallback: number): number {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : fallback;
}

export type MediaProtocolDeps = {
  getProject: (projectId: string) => Promise<Project>;
  getTranscript: (projectId: string) => Promise<Transcript | null>;
  /** Vendored gsap source, inlined into preview docs so they stay offline. */
  gsapSource: string;
};

/**
 * Register the `sp-media://` handler (after `app.ready`). Routes:
 *  - `sp-media://video/<projectId>`           -> the project's source file (range-streamed)
 *  - `sp-media://frame/<projectId>/<candId>?layout&caption&title&head&theme&fit&kw&s&e` -> live-preview document
 * Both validate ids and only ever touch a known project's own source.
 */
export function registerMediaProtocol(deps: MediaProtocolDeps): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const kind = url.hostname;
      const parts = url.pathname.split("/").filter(Boolean);

      if (kind === "video") {
        const project = await deps.getProject(assertSafeId(parts[0], "project id"));
        return await serveFile(project.source.path, request.headers.get("Range"));
      }

      if (kind === "frame") {
        const projectId = assertSafeId(parts[0], "project id");
        const candidateId = assertSafeId(parts[1], "candidate id");
        const [project, transcript] = await Promise.all([
          deps.getProject(projectId),
          deps.getTranscript(projectId),
        ]);
        const candidate = project.candidates.find((c) => c.id === candidateId);
        if (!candidate || !transcript) {
          return new Response("not found", { status: 404 });
        }
        const q = url.searchParams;
        const layout = q.get("layout");
        const caption = q.get("caption");
        const title = q.get("title");
        const head = q.get("head");
        const theme = q.get("theme");
        const fit = q.get("fit");
        const kw = q.get("kw");
        const html = buildPreviewDocument({
          videoSrc: `${MEDIA_SCHEME}://video/${projectId}`,
          gsapSource: deps.gsapSource,
          words: transcript.words,
          silences: transcript.silences,
          sourceDuration: project.source.duration,
          sourceWidth: project.source.width,
          sourceHeight: project.source.height,
          candidate: {
            title: head ?? candidate.title,
            layout: isLayout(layout) ? layout : candidate.layout,
            captionStyle: isCaption(caption) ? caption : candidate.captionStyle,
            titleStyle: isTitleStyle(title) ? title : candidate.titleStyle,
            theme: isTheme(theme) ? theme : candidate.theme,
            videoFit: isVideoFit(fit) ? fit : candidate.videoFit,
            keywords: kw != null ? kw.split(",").filter(Boolean) : candidate.keywords,
            startTime: num(q.get("s"), candidate.startTime),
            endTime: num(q.get("e"), candidate.endTime),
            // Manual waveform cut override (absent unless the user fine-tuned it).
            cutStart: q.get("cs") != null ? num(q.get("cs"), candidate.startTime) : undefined,
            cutEnd: q.get("ce") != null ? num(q.get("ce"), candidate.endTime) : undefined,
          },
        });
        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }

      return new Response("not found", { status: 404 });
    } catch (err) {
      return new Response(`preview error: ${err instanceof Error ? err.message : String(err)}`, {
        status: 500,
      });
    }
  });
}
