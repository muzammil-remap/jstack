/**
 * The one boundary between ApiAdapter and "how a request actually
 * travels" (ADR-02). `httpTransport` (fetch) and `mockTransport` (routes
 * into data/mock/server.ts) both implement this; ApiAdapter never knows
 * which one it's holding.
 */
/**
 * X-1 (UP-02): one part of a multipart upload — a file, and the string fields
 * that say what it belongs to.
 *
 * `data` is the bytes on web (a `Blob` from a file input, a paste or a drop)
 * and a file URI on native, where the picker hands back a path in the
 * expo-file-system cache rather than the contents (resolution #33). The
 * transport that carries it knows which it is holding; nothing above this
 * boundary does.
 */
export type MultipartFile = {
  filename: string;
  contentType: string;
  size: number;
  data: Blob | string;
};

export type TransportRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string; // e.g. "/today", "/actions/{id}" already interpolated
  query?: Record<string, string | undefined>;
  body?: unknown;
  /**
   * X-1: an upload. A request carries `body` OR `multipart`, never both —
   * this is a different content type, not a different shape of JSON.
   *
   * It rides on `TransportRequest` rather than becoming a second Transport
   * method because ADR-02's whole point is that `ApiAdapter` never knows
   * which transport it is holding: a second method would be a second
   * boundary, and every caller would have to know which one to reach for.
   */
  multipart?: { file: MultipartFile; fields?: Record<string, string | undefined> };
};

export type TransportResponse = { status: number; json: unknown };

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;
