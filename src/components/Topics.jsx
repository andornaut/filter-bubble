import React, { useState } from 'react';
import { TextField } from './FormFields';
import { TOPICS_HINT, HelpContent } from './Hints';
import {
  addTopic,
  editTopic,
  deleteTopic,
  selectTopic,
  toggleTopicEnabled,
  cancelSelectedTopic,
  toTopicId,
  addError,
  clearAllErrors,
  toggleShowHelp,
} from '../state/actions';
import { toCanonicalArray, unsplit, sortByModifiedDateDesc, humanDate } from '../helpers';

const Topics = ({ state, setState }) => {
  const [formData, setFormData] = useState({ text: '' });
  const { topics } = state;
  const { list = [], selected } = topics;
  const isEditing = !!selected;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const transformTopicData = (data) => {
    const transformedData = {
      ...data,
      text: toCanonicalArray((data.text || '').toLowerCase()),
    };

    if (!transformedData.text.length) {
      throw new Error('Please fill in the "Text" field');
    }

    return transformedData;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const transformedData = transformTopicData(formData);

      if (isEditing) {
        editTopic(setState, transformedData, selected);
      } else {
        addTopic(setState, transformedData);
      }

      setFormData({ text: '' });
      clearAllErrors(setState);
    } catch (error) {
      console.warn(error);
      addError(setState, error.message);
    }
  };

  const handleCancel = () => {
    cancelSelectedTopic(setState);
    setFormData({ text: '' });
  };

  const handleDelete = () => {
    try {
      deleteTopic(setState, selected);
      setFormData({ text: '' });
      clearAllErrors(setState);
    } catch (error) {
      console.warn(error);
      addError(setState, error.message);
    }
  };

  const handleSelectTopic = (id) => {
    const topic = list.find((t) => toTopicId(t) === id);
    if (topic) {
      selectTopic(setState, id);
      setFormData({ text: unsplit(topic.text) });
    }
  };

  const handleToggleEnabled = (id) => {
    toggleTopicEnabled(setState, id);
  };

  const handleToggleHelp = (e) => {
    e.preventDefault();
    toggleShowHelp(setState);
  };

  // Update form data when editing mode changes
  React.useEffect(() => {
    if (isEditing && selected) {
      setFormData({ text: unsplit(selected.text) });
    } else if (!isEditing) {
      setFormData({ text: '' });
    }
  }, [isEditing, selected]);

  return (
    <section>
      <div className="form">
        <form onSubmit={handleSubmit}>
          <TextField label="Topics" name="text" value={formData.text} onChange={handleInputChange} hint={TOPICS_HINT} />

          {isEditing && (
            <time className="form__date" dateTime={selected.modifiedDate}>
              <span className="form__date-label">Last updated:</span>
              {humanDate(selected.modifiedDate)}
            </time>
          )}

          <div className="form__actions-container">
            <div className="form__actions-primary">
              <button className="btn btn--primary" type="submit">
                {isEditing ? 'Save' : 'Add'}
              </button>
              <button onClick={handleCancel} className="btn" type="button">
                Cancel
              </button>
            </div>
            {isEditing && (
              <button onClick={handleDelete} className="btn btn--danger" type="button">
                Delete
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="list">
        {!list.length ? (
          <HelpContent />
        ) : (
          <>
            <ul>
              {sortByModifiedDateDesc(list).map((topic) => {
                const id = toTopicId(topic);
                const isSelected = selected && toTopicId(selected) === id;
                const cssClasses = [
                  'list__item',
                  isSelected && 'list__item--active',
                  !topic.enabled && 'list__item--disabled',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <li key={id} className={cssClasses} data-id={id}>
                    <div className="list__content" onClick={() => handleSelectTopic(id)}>
                      <div className="list__details">
                        <span className="topics__text">{unsplit(topic.text)}</span>
                      </div>
                    </div>
                    <button
                      className="list__toggle list__toggle-btn"
                      onClick={() => handleToggleEnabled(id)}
                      title="Toggle enabled / disabled"
                      type="button"
                    >
                      {topic.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </li>
                );
              })}
            </ul>
            {state.showHelp && <HelpContent />}
            <p className="list__show-help">
              <a href="#" onClick={handleToggleHelp}>
                {state.showHelp ? 'Hide help' : 'Show help'}
              </a>
            </p>
          </>
        )}
      </div>
    </section>
  );
};

export default Topics;
