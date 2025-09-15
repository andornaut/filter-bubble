import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import { fromStorage, toStorage } from './storage';
import { checkPermissions, setGlobalSetState } from './permissions';
import { getDefaultState } from './state/initialState';

const Root = () => {
  const [state, setState] = useState(getDefaultState());
  const [hash, setHash] = useState(window.location.hash || '#topics');

  // Set global setState for permissions
  useEffect(() => {
    setGlobalSetState(setState);
  }, []);

  // Initialize state from storage
  useEffect(() => {
    const init = async () => {
      const initialState = await fromStorage();
      const mergedState = { ...getDefaultState(), ...initialState };
      setState(mergedState);
      checkPermissions(mergedState);
    };
    init();
  }, []);

  // Save state to storage whenever it changes
  useEffect(() => {
    toStorage(state);
  }, [state]);

  // Handle hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash);
      // Reset selected items when changing tabs
      setState((prevState) => ({
        ...prevState,
        topics: { ...prevState.topics, selected: null },
        websites: { ...prevState.websites, selected: null },
      }));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Create a port to the background page (Chrome workaround)
  useEffect(() => {
    try {
      chrome.runtime.connect();
    } catch {
      // Ignore if chrome extension APIs are not available (during tests)
    }
  }, []);

  return <App state={state} setState={setState} hash={hash} />;
};

const container = document.body;
const root = createRoot(container);
root.render(<Root />);
