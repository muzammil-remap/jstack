/**
 * CD-10 — People's verb button fired its success toast unconditionally
 * (`void actPerson(id, action)`), so a rejected write still told Josh it was
 * "Drafted"/"Nudged"/"Done". This proves the await is real: a rejection
 * shows an honest error toast, never the success line, and a later success
 * still shows the normal one.
 *
 * B-2 moved People from a component to a config record, so the verb now
 * fires through `SectionRenderer`'s shared `useAct`. The test moved with it
 * rather than being deleted with the component: the defect CD-10 recorded
 * belongs to whatever code owns the verb, and it now owns SIX sections'
 * worth of verbs instead of one.
 */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { SectionRenderer } from "@/layout/SectionRenderer";
import sectionsFixture from "@/data/mock/fixtures/sections.json";
import type { SectionConfig } from "@/data/types";
import { reset as resetDb } from "@/data/mock/db";
import { getAdapter } from "@/data/provider";
import { ContractError } from "@/data/ApiAdapter";
import { useLifeStore } from "@/stores/life";
import { useSessionStore } from "@/stores/session";

const peopleConfig = (sectionsFixture as SectionConfig[]).find((c) => c.id === "people")!;

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>{children}</ThemeProvider>
    </GestureHandlerRootView>
  );
}

beforeEach(async () => {
  resetDb();
  useLifeStore.setState({ goals: [], habits: [], habitLogs: [], people: [], money: [], moneyDue: [], sectionConfigs: {} });
  useSessionStore.setState({ toast: null });
  await useLifeStore.getState().load();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("People — verb call is awaited (CD-10)", () => {
  it("shows an honest error toast, not the success line, when the write rejects", async () => {
    const person = useLifeStore.getState().people[0];
    jest.spyOn(getAdapter(), "postPersonAct").mockRejectedValueOnce(new ContractError(500, { reason: "server unavailable" }));

    const { getByTestId } = render(
      <Providers>
        <SectionRenderer config={peopleConfig} />
      </Providers>,
    );

    await act(async () => {
      fireEvent.press(getByTestId(`person-act-${person.id}`));
      await Promise.resolve();
      await Promise.resolve();
    });

    const message = useSessionStore.getState().toast?.message;
    expect(message).not.toBe("Drafted · never sends itself");
    expect(message).not.toBe("Nudged");
    expect(message).not.toBe("Done");
    expect(message).toMatch(/could?n.?t|couldn't|try again|server unavailable/i);
  });

  it("still shows the normal toast when the write succeeds", async () => {
    const person = useLifeStore.getState().people[0];

    const { getByTestId } = render(
      <Providers>
        <SectionRenderer config={peopleConfig} />
      </Providers>,
    );

    await act(async () => {
      fireEvent.press(getByTestId(`person-act-${person.id}`));
      await Promise.resolve();
      await Promise.resolve();
    });

    const message = useSessionStore.getState().toast?.message;
    expect(["Drafted · never sends itself", "Nudged", "Done"]).toContain(message);
  });
});
