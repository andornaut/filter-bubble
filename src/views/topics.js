import {
  addTopic,
  deleteTopic,
  editTopic,
  toggleTopicEnabled,
  toId,
} from "../actions/topics";
import { toCanonicalArray, unsplit } from "../helpers";
import { useSelection } from "../hooks/useSelection";
import { textField } from "./fields";
import { AddForm, EditForm } from "./form";
import { TOPICS_HINT } from "./hints";
import { List } from "./list";

const fields = (topic = { text: "" }) =>
  textField({
    hint: TOPICS_HINT,
    label: "Topics",
    name: "text",
    value: unsplit(topic.text),
  });

const transform = (data) => {
  data.text = toCanonicalArray((data.text || "").toLowerCase());
  // The form allows submission of whitespace-only values. We .trim() after submission, therefore we must
  // validate this case.
  if (!data.text.length) {
    throw new Error('Please fill in the "Text" field');
  }
  return data;
};

const itemDetails = ({ text }) => (
  <span className="topics__text">{unsplit(text)}</span>
);

export const Topics = ({ list }) => {
  const { clearSelected, handleSelect, selected, selectedId } = useSelection(
    list,
    toId,
  );
  const handleDelete = () => {
    deleteTopic(selectedId);
    clearSelected();
  };
  const handleEdit = (data) => {
    editTopic(selectedId, data);
    clearSelected();
  };

  return (
    <section>
      <div className="form">
        {selected ? (
          <EditForm
            cancelSelected={clearSelected}
            deleteSelected={handleDelete}
            editSelected={handleEdit}
            fields={fields}
            selected={selected}
            transform={transform}
          />
        ) : (
          <AddForm
            addItem={addTopic}
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
        toggleEnabled={toggleTopicEnabled}
      />
    </section>
  );
};
