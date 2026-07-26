import { topicActions } from "../actions/topics";
import { unsplit } from "../helpers";
import { canonicalizeText } from "../validation";
import { Collection } from "./collection";
import { textField } from "./fields";
import { TOPICS_HINT } from "./hints";

const fields = (topic = { text: "" }) =>
  textField({
    hint: TOPICS_HINT,
    label: "Topics",
    name: "text",
    value: unsplit(topic.text),
  });

const transform = (data) => {
  data.text = canonicalizeText(data.text);
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

export const Topics = ({ list }) => (
  <Collection
    actions={topicActions}
    fields={fields}
    itemDetails={itemDetails}
    list={list}
    transform={transform}
  />
);
