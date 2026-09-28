/** §4.19 Global search (K-1). The index and every scoping rule are
 * `data/mock/search.ts`'s; this is the route. */
import { search } from "@/data/mock/search";
import { ok } from "@/data/mock/util";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";
import type { SearchResponse } from "@/data/types";

export function getSearch(req: TransportRequest): TransportResponse {
  const q = req.query ?? {};
  return ok<SearchResponse>(
    search({
      q: q.q ?? "",
      ...(q.focus != null ? { focus: q.focus } : {}),
      ...(q.sensitivity != null ? { sensitivity: q.sensitivity } : {}),
      ...(q.limit != null ? { limit: Number(q.limit) } : {}),
    }),
  );
}
