import {
  addTopic,
  cancelSelectedTopic,
  deleteSelectedTopic,
  editSelectedTopic,
  selectTopic,
  toggleTopicEnabled,
  toId,
} from "../actions/topics";
import { toCanonicalArray, unsplit } from "../helpers";
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

const itemDetails = ({ text }) => <span className="topics__text">{unsplit(text)}</span>;

export const Topics = ({ state }) => (
  <section>
    <div className="form">
      {state.topics.selected ? (
        <EditForm
          cancelSelected={cancelSelectedTopic}
          deleteSelected={deleteSelectedTopic}
          editSelected={editSelectedTopic}
          fields={fields}
          selected={state.topics.selected}
          transform={transform}
        />
      ) : (
        <AddForm addItem={addTopic} cancelSelected={cancelSelectedTopic} fields={fields} transform={transform} />
      )}
    </div>
    <List
      itemDetails={itemDetails}
      list={state.topics.list}
      select={selectTopic}
      selectedId={toId(state.topics.selected || {})}
      toId={toId}
      toggleEnabled={toggleTopicEnabled}
    />
  </section>
);
