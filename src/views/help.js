import { useEffect, useRef, useState } from "react";

import { HELP_HTML } from "./hints";

export const Help = () => {
  const [showHelp, setShowHelp] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    if (showHelp && sectionRef.current) {
      sectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showHelp]);

  const handleToggle = (event) => {
    event.preventDefault();
    setShowHelp(!showHelp);
  };
  const label = showHelp ? "Hide help" : "Show help";
  return (
    <section className="help" ref={sectionRef}>
      {showHelp && HELP_HTML}
      <p className="help__show">
        <a href="#" onClick={handleToggle}>
          {label}
        </a>
      </p>
    </section>
  );
};
