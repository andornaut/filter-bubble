import { useState } from "react";

export const useSelection = (list, toId) => {
  const [selectedId, setSelectedId] = useState("");
  // Derive the item rather than snapshot it, so the selection stays current
  // when the item is edited elsewhere (e.g. by a sync) and collapses to "no
  // selection" when it is deleted.
  const selected = list.find((item) => toId(item) === selectedId) || null;

  return {
    clearSelected: () => setSelectedId(""),
    handleSelect: setSelectedId,
    selected,
    selectedId,
  };
};
