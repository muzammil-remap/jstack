/**
 * N8N-2: the one line a section shows when its source is not connected yet — where its empty value
 * would have read as a fact ("all healthy", "Nothing failing", "The Librarian runs again at 2:00").
 * The store says which sections those are (`lib/loadError.ts` `orNotConnected`).
 */
import React from "react";
import { Meta } from "@/theme/ui";

export function NotConnected({ testID }: { testID: string }) {
  return <Meta testID={testID}>Not connected yet</Meta>;
}
