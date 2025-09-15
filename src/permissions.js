// Global setState will be set by the main app
let globalSetState = null;

export const setGlobalSetState = (setState) => {
  globalSetState = setState;
};

const setHasPermissions = (hasPermissions) => {
  if (globalSetState) {
    globalSetState((prevState) => ({
      ...prevState,
      hasPermissions,
    }));
  }
};

const toPermissions = (addresses) => ({ origins: addresses.map((address) => `*://${address}/*`) });

const getPermissionsFromState = (state) => {
  const addresses = state.websites.list.reduce((accumulator, current) => {
    accumulator.push(...current.addresses);
    return accumulator;
  }, []);

  return toPermissions(addresses);
};

const requestPermissions = (permissions) => {
  try {
    return chrome.permissions.request(permissions).then(setHasPermissions);
  } catch (e) {
    // Handle cases where chrome APIs are not available (during tests)
    console.warn('Chrome permissions API not available:', e);
    return Promise.resolve(false);
  }
};

export const checkPermissions = (state) => {
  try {
    return chrome.permissions.contains(getPermissionsFromState(state)).then(setHasPermissions);
  } catch (e) {
    // Handle cases where chrome APIs are not available (during tests)
    console.warn('Chrome permissions API not available:', e);
    return Promise.resolve(false);
  }
};

export const requestPermissionsFromAddresses = (addresses) => requestPermissions(toPermissions(addresses));

export const requestPermissionsFromState = (state) => requestPermissions(getPermissionsFromState(state));
