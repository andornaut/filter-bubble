import { clearError, toId } from "../actions/errors";
import { sortByModifiedDateDesc } from "../helpers";

const CLEAR_LABEL = "Clear message";

const Error = ({ item }) => {
  const id = toId(item);
  const handleDelete = () => clearError(id);
  return (
    <li className="errors__item">
      {item.message}
      <button
        aria-label={CLEAR_LABEL}
        className="btn errors__delete"
        onClick={handleDelete}
        title={CLEAR_LABEL}
      >
        [x]
      </button>
    </li>
  );
};

export const Errors = ({ errors }) => {
  const list = errors || [];
  if (!list.length) {
    return null;
  }
  return (
    <ul className="errors">
      {sortByModifiedDateDesc(list).map((item) => (
        <Error item={item} key={toId(item)} />
      ))}
    </ul>
  );
};
