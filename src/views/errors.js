import { clearError, toId } from "../actions/errors";
import { sortByModifiedDateDesc } from "../helpers";

const CLEAR_LABEL = "Clear message";

const handleDelete = (event) => {
  const { id } = event.target.dataset;
  clearError(id);
};

const itemTemplate = ({ message }) => (
  <li className="errors__item">
    {message}
    <button
      aria-label={CLEAR_LABEL}
      className="btn errors__delete"
      data-id={message}
      onClick={handleDelete}
      title={CLEAR_LABEL}
    >
      [x]
    </button>
  </li>
);

export const Errors = ({ state }) => {
  const list = state.errors || [];
  if (!list.length) {
    return null;
  }
  return (
    <ul className="errors">
      {sortByModifiedDateDesc(list).map((item) => {
        const key = toId(item);
        return <li key={key}>{itemTemplate(item)}</li>;
      })}
    </ul>
  );
};
