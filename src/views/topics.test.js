import { fireEvent, render, screen } from "@testing-library/react";
import { getState, setState } from "statezero/src";

import { toId } from "../actions/errors";
import { Topics } from "./topics";

// The add/edit form is one of the two validation boundaries the store has, so
// these cover what a phrase becomes on the way in and what is refused outright.
const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const renderTopics = (list = []) => {
  setState(undefined, { errors: [], topics: { list } });
  render(<Topics list={getState("topics").list} />);
};

const add = async (value) => {
  fireEvent.change(screen.getByLabelText("Topics"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await flush();
};

const storedTopics = () => getState("topics").list;
const errorMessages = () => getState("errors").map(toId);

describe("Topics", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
  });

  it("canonicalizes an entry into one topic's phrases", async () => {
    renderTopics();

    await add(" Politics , sports , politics ");

    // Trimmed, lowercased, de-duplicated and sorted, and both phrases belong to
    // one topic rather than one topic each.
    expect(storedTopics()).toHaveLength(1);
    expect(storedTopics()[0].text).toEqual(["politics", "sports"]);
    expect(errorMessages()).toEqual([]);
  });

  it("refuses an entry that is nothing but whitespace", async () => {
    renderTopics();

    // Whitespace survives the form's own required check, so the app has to
    // reject it after trimming.
    await add("   ");

    expect(storedTopics()).toEqual([]);
    expect(errorMessages()).toEqual(['Please fill in the "Text" field']);
  });

  it("refuses a topic listing the phrases another one already holds", async () => {
    renderTopics([
      {
        enabled: true,
        id: "topic-politics",
        modifiedDate: "2026-01-01T00:00:00.000Z",
        text: ["politics"],
      },
    ]);

    await add("politics");

    expect(storedTopics()).toHaveLength(1);
    expect(errorMessages()).toEqual(["Duplicate item: politics"]);
  });

  it("shows a topic's phrases the way they are typed back into the form", () => {
    renderTopics([
      {
        enabled: true,
        id: "topic-1",
        modifiedDate: "2026-01-01T00:00:00.000Z",
        text: ["politics", "sports"],
      },
    ]);

    expect(screen.getByText("politics, sports")).toBeVisible();
  });
});
