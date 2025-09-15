import React from 'react';
import { sortByModifiedDateDesc } from '../helpers';

const ErrorList = ({ state, setState }) => {
  const errorList = state.errors?.list || [];

  if (!errorList.length) return null;

  const handleClearError = (message) => {
    setState((prevState) => ({
      ...prevState,
      errors: {
        ...prevState.errors,
        list: prevState.errors.list.filter((error) => error.message !== message),
      },
    }));
  };

  const clearLabel = 'Clear message';

  return (
    <ul className="errors">
      {sortByModifiedDateDesc(errorList).map(({ message }) => (
        <li key={message} className="errors__item">
          {message}
          <button
            aria-label={clearLabel}
            onClick={() => handleClearError(message)}
            className="btn errors__delete"
            title={clearLabel}
          >
            [x]
          </button>
        </li>
      ))}
    </ul>
  );
};

export default ErrorList;
