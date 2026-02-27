import { sortByModifiedDateDesc } from "../helpers";
import { Item } from "./item";

export const List = ({
  itemDetails,
  list,
  select,
  selectedId,
  toId,
  toggleEnabled,
}) => {
  if (!list.length) {
    return null;
  }
  return (
    <ul className="list">
      {sortByModifiedDateDesc(list).map((item) => {
        const id = toId(item);
        return (
          <Item
            details={itemDetails}
            id={id}
            isSelected={selectedId === id}
            item={item}
            key={id}
            select={select}
            toggleEnabled={toggleEnabled}
          />
        );
      })}
    </ul>
  );
};
