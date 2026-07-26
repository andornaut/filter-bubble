import { useSelection } from "../hooks/useSelection";
import { AddForm, EditForm } from "./form";
import { List } from "./list";

// Shared scaffold for the Topics and Websites tabs: an add/edit form over a
// selectable list, wired to one collection's pre-bound action set.
export const Collection = ({
  actions: { addItem, deleteItem, editItem, toId, toggleEnabled },
  callback,
  fields,
  itemDetails,
  list,
  transform,
}) => {
  const { clearSelected, handleSelect, selected, selectedId } = useSelection(
    list,
    toId,
  );
  const handleDelete = () => {
    deleteItem(selectedId);
    clearSelected();
  };
  const handleEdit = (data) => {
    editItem(selectedId, data);
    clearSelected();
  };

  return (
    <section>
      <div className="form">
        {selected ? (
          // Remount per selection: the uncontrolled inputs otherwise keep an
          // already-edited value when the selection changes.
          <EditForm
            callback={callback}
            cancelSelected={clearSelected}
            deleteSelected={handleDelete}
            editSelected={handleEdit}
            fields={fields}
            key={selectedId}
            selected={selected}
            transform={transform}
          />
        ) : (
          <AddForm
            addItem={addItem}
            callback={callback}
            cancelSelected={clearSelected}
            fields={fields}
            transform={transform}
          />
        )}
      </div>
      <List
        itemDetails={itemDetails}
        list={list}
        select={handleSelect}
        selectedId={selectedId}
        toId={toId}
        toggleEnabled={toggleEnabled}
      />
    </section>
  );
};
