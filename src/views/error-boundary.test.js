import { fireEvent, render, screen } from "@testing-library/react";

import { ErrorBoundary, ErrorFallback } from "./error-boundary";

// `storage.sync` is a namespace another device, another release, or a hand edit
// can write to, and nothing validates a value on the way in: the form and the
// import page are the only validation boundary. So a value the views cannot
// render reaches them as it is and takes the render down.
const MESSAGE = "text.join is not a function";

const Boom = () => {
  throw new Error(MESSAGE);
};

describe("ErrorFallback", () => {
  it("names the failure rather than describing it in the abstract", () => {
    render(<ErrorFallback error={new Error("boom")} onRetry={() => {}} />);

    expect(screen.getByRole("heading")).toHaveTextContent(
      "Something went wrong",
    );
    expect(screen.getByText("boom")).toBeVisible();
  });

  it("renders a reason that is not an Error", () => {
    render(<ErrorFallback error="just a string" onRetry={() => {}} />);

    expect(screen.getByText("just a string")).toBeVisible();
  });
});

describe("ErrorBoundary", () => {
  let consoleError;
  let syncGet;

  beforeEach(() => {
    // Retrying re-runs `initState`, which reads both storage areas. Real rather
    // than mocked, so a retry that cannot read storage fails the way it would
    // in the browser.
    syncGet = jest.fn(() => Promise.resolve({ schema: 2 }));
    global.chrome = {
      storage: {
        local: { get: () => Promise.resolve({}), set: () => Promise.resolve() },
        onChanged: { addListener: () => {} },
        sync: {
          get: (...args) => syncGet(...args),
          remove: () => Promise.resolve(),
          set: () => Promise.resolve(),
        },
      },
    };
    // React reports a caught render failure on its own, and so does the
    // boundary's `componentDidCatch`.
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders its children while they render", () => {
    render(
      <ErrorBoundary>
        <p>the app</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("the app")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says so instead of coming up blank", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading")).toHaveTextContent(
      "Something went wrong",
    );
    expect(screen.getByText(MESSAGE)).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  // The repair a user has available is on the other device: they cannot edit an
  // item the UI will not show them. Retrying renders the children again.
  it("comes back when the cause is gone", async () => {
    let broken = true;
    const Child = () => {
      if (broken) {
        throw new Error(MESSAGE);
      }
      return <p>the app</p>;
    };
    render(
      <ErrorBoundary>
        <Child />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();

    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("the app")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  // Retrying into the same failure has to leave the message and the button
  // where they were: a button that empties the page is worse than no button.
  it("holds the failure when retrying changes nothing", async () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Try again" });

    expect(screen.getByText(MESSAGE)).toBeVisible();
  });

  // A failed retry must not leave an unhandled rejection and a seemingly dead
  // button; it reports what went wrong this time.
  it("shows the new failure when the retry itself fails", async () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    syncGet.mockRejectedValue(new Error("storage unavailable"));

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("storage unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
