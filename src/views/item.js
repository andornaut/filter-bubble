export const Item = ({
  details,
  id,
  isSelected,
  item,
  select,
  toggleEnabled,
}) => {
  const { enabled } = item;
  const handleSelect = () => select(id);
  const handleToggle = () => toggleEnabled(id);
  const cssClasses = `list__item ${isSelected ? "list__item--active" : ""} ${
    !enabled ? "list__item--disabled" : ""
  }`.trim();
  const toggleEnabledLabel = enabled ? "Disable" : "Enable";
  return (
    <li className={cssClasses}>
      <button
        aria-current={isSelected ? "true" : undefined}
        className="list__content"
        onClick={handleSelect}
        type="button"
      >
        <span className="list__details">{details(item)}</span>
      </button>
      <button
        className="list__toggle list__toggle-btn"
        onClick={handleToggle}
        title="Toggle enabled / disabled"
        type="button"
      >
        {toggleEnabledLabel}
      </button>
    </li>
  );
};
