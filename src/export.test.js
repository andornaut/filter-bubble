import { downloadJson, exportFilename } from "./export";

describe("exportFilename", () => {
  it("builds a dated json filename for the given kind", () => {
    expect(exportFilename("topics")).toMatch(
      /^filter-bubble-topics-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });
});

describe("downloadJson", () => {
  let click;
  let createObjectURL;
  let revokeObjectURL;

  beforeEach(() => {
    jest.useFakeTimers();
    click = jest.fn();
    createObjectURL = jest.fn(() => "blob:fake");
    revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    delete global.URL.createObjectURL;
    delete global.URL.revokeObjectURL;
  });

  it("clicks a download anchor and revokes the object URL after the download starts", () => {
    downloadJson("topics.json", { topics: [] });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    // Revoke is deferred so it does not abort the download.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    jest.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("leaves no anchor attached to the document", () => {
    downloadJson("topics.json", { topics: [] });

    expect(document.querySelector("a")).toBeNull();
  });
});
