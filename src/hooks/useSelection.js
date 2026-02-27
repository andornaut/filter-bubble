import { useState } from "react";

export const useSelection = (list, toId) => {
  const [selected, setSelected] = useState(null);
  const selectedId = selected ? toId(selected) : "";

  const handleSelect = (id) => {
    const item = list.find((item) => toId(item) === id);
    setSelected(item);
  };
  const clearSelected = () => setSelected(null);

  return { clearSelected, handleSelect, selected, selectedId };
};
